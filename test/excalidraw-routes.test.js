import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

import { registerExcalidrawRoutes } from "../lib/excalidraw-routes.js";

const config = {
  textToDiagramModel: "test-text-model",
  diagramToCodeModel: "test-code-model",
  textToDiagramTemperature: 0.1,
  textToDiagramMaxTokens: 1600,
  diagramToCodeMaxTokens: 4000,
  maxPromptChars: 20,
  mermaidAutoRepair: true,
  mermaidMaxRepairAttempts: 1,
  mermaidMaxNodes: 0,
};

test("health route returns ok", async () => {
  const server = await listen(createTestApp(createFakeOpenAI()));

  try {
    const response = await fetch(`${server.url}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
  } finally {
    await close(server.instance);
  }
});

test("diagram-to-code route rejects requests without an image", async () => {
  const server = await listen(createTestApp(createFakeOpenAI()));

  try {
    const response = await fetch(`${server.url}/v1/ai/diagram-to-code/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: ["hello"] }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.message, "Missing image");
  } finally {
    await close(server.instance);
  }
});

test("diagram-to-code route returns generated HTML", async () => {
  const server = await listen(createTestApp(createFakeOpenAI()));

  try {
    const response = await fetch(`${server.url}/v1/ai/diagram-to-code/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texts: ["Button"],
        image: "data:image/png;base64,test",
        theme: "dark",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.html, "<main>ok</main>");
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route rejects missing messages", async () => {
  const server = await listen(createTestApp(createFakeOpenAI()));

  try {
    const response = await fetch(`${server.url}/v1/ai/text-to-diagram/chat-streaming`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await response.text();

    assert.equal(response.status, 400);
    assert.equal(body, "Missing messages");
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route rejects over-limit prompts", async () => {
  const server = await listen(createTestApp(createFakeOpenAI()));

  try {
    const response = await fetch(`${server.url}/v1/ai/text-to-diagram/chat-streaming`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "this prompt is longer than the configured test limit" }],
      }),
    });
    const body = await response.text();

    assert.equal(response.status, 413);
    assert.equal(body, "Prompt is too long. Max 20 characters.");
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram streaming route emits normalized Mermaid SSE", async () => {
  const server = await listen(createTestApp(createFakeOpenAI()));

  try {
    const response = await fetch(`${server.url}/v1/ai/text-to-diagram/chat-streaming`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "simple flow" }],
      }),
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /"type":"content"/);
    assert.match(body, /flowchart TD/);
    assert.match(body, /A -->\|ok\| B/);
    assert.match(body, /data: \[DONE\]/);
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route removes invalid styling through the HTTP path", async () => {
  const server = await listen(createTestApp(createFakeOpenAI({
    mermaidChunks: [
      "flowchart TD\n  A[User prompt] --> LEGEND[Legend]\n",
      "  class LEGEND fill:#fff,stroke:#000,color:#000",
    ],
  })));

  try {
    const response = await fetch(`${server.url}/v1/ai/text-to-diagram/chat-streaming`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "simple flow" }],
      }),
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /LEGEND\[Legend\]/);
    assert.doesNotMatch(body, /class LEGEND fill/);
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route rejects empty OpenAI output", async () => {
  const server = await listen(createTestApp(createFakeOpenAI({ mermaidChunks: [""] })));

  try {
    const response = await fetch(`${server.url}/v1/ai/text-to-diagram/chat-streaming`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "simple flow" }],
      }),
    });
    const body = await response.text();

    assert.equal(response.status, 502);
    assert.equal(body, "OpenAI returned an empty Mermaid diagram");
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route rejects invalid Mermaid after repair", async () => {
  const server = await listen(createTestApp(createFakeOpenAI({
    mermaidChunks: ["not mermaid"],
    repairChunks: ["still invalid"],
  })));

  try {
    const response = await fetch(`${server.url}/v1/ai/text-to-diagram/chat-streaming`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "simple flow" }],
      }),
    });
    const body = await response.text();

    assert.equal(response.status, 502);
    assert.equal(body, "OpenAI returned invalid Mermaid after repair");
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route retries with the classified error and streams the repair", async () => {
  const openai = createFakeOpenAI({
    mermaidChunks: ["flowchart TD\n  subgraph S1[Group]\n", "    A[Start] --> B[Done]"],
    repairChunks: ["flowchart TD\n  subgraph S1[\"Group\"]\n    A[Start] --> B[Done]\n  end"],
  });
  const server = await listen(createTestApp(openai));

  try {
    const response = await postPrompt(server.url, {
      messages: [{ role: "user", content: "simple flow" }],
    });

    assert.equal(response.status, 200);
    assert.equal(openai.chatCalls.length, 2);
    assert.match(userPromptOf(openai.chatCalls[1]), /Error type: unbalanced_subgraph/);
    assert.match(response.body, /subgraph/);
    assert.match(response.body, /data: \[DONE\]/);
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route serves an importable diagram that stays over the node limit", async () => {
  const large = [
    "flowchart TD",
    "  A[One] --> B[Two]",
    "  B --> C[Three]",
    "  C --> D[Four]",
  ].join("\n");
  const openai = createFakeOpenAI({ mermaidChunks: [large], repairChunks: [large] });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerExcalidrawRoutes(app, { openai, config: { ...config, mermaidMaxNodes: 2 } });
  const server = await listen(app);

  try {
    const response = await postPrompt(server.url, {
      messages: [{ role: "user", content: "simple flow" }],
    });

    assert.equal(response.status, 200);
    assert.equal(openai.chatCalls.length, 2);
    assert.match(userPromptOf(openai.chatCalls[1]), /Error type: node_limit_exceeded/);
    assert.match(response.body, /C --> D\[Four\]/);
  } finally {
    await close(server.instance);
  }
});

// Regression: the sanitizer turns prose into a bare `flowchart TD`, which the
// Mermaid parser accepts. Without the empty-diagram class this was streamed to
// Excalidraw as a successful, node-less diagram.
test("text-to-diagram route repairs prose-only output instead of streaming an empty diagram", async () => {
  const openai = createFakeOpenAI({
    mermaidChunks: ["Here is a diagram: nice"],
    repairChunks: ["flowchart TD\n  U[User] --> S[Session]"],
  });
  const server = await listen(createTestApp(openai));

  try {
    const response = await postPrompt(server.url, {
      messages: [{ role: "user", content: "a login flow" }],
    });

    assert.equal(response.status, 200);
    assert.match(userPromptOf(openai.chatCalls[1]), /Error type: empty_diagram/);
    assert.match(userPromptOf(openai.chatCalls[1]), /Original request:\na login flow/);
    assert.match(response.body, /U\[User\] --> S\[Session\]/);
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route fails prose-only output when repair is disabled", async () => {
  const openai = createFakeOpenAI({ mermaidChunks: ["Here is a diagram: nice"] });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerExcalidrawRoutes(app, { openai, config: { ...config, mermaidAutoRepair: false } });
  const server = await listen(app);

  try {
    const response = await postPrompt(server.url, {
      messages: [{ role: "user", content: "a login flow" }],
    });

    assert.equal(response.status, 502);
    assert.equal(response.body, "OpenAI returned invalid Mermaid after repair");
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route selects the prompt contract from the prompt", async () => {
  const openai = createFakeOpenAI();
  const server = await listen(createTestApp(openai));

  try {
    await postPrompt(server.url, { messages: [{ role: "user", content: "visa arkitekturen" }] });

    assert.match(systemPromptOf(openai.chatCalls[0]), /describing a software architecture/);
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route honours an explicit mode over the prompt heuristic", async () => {
  const architectureByMode = createFakeOpenAI();
  const defaultByMode = createFakeOpenAI();
  const first = await listen(createTestApp(architectureByMode));
  const second = await listen(createTestApp(defaultByMode));

  try {
    await postPrompt(first.url, {
      messages: [{ role: "user", content: "a login flow" }],
      mode: "architecture",
    });
    await postPrompt(second.url, {
      messages: [{ role: "user", content: "visa arkitekturen" }],
      mode: "default",
    });

    assert.match(
      systemPromptOf(architectureByMode.chatCalls[0]),
      /describing a software architecture/,
    );
    assert.doesNotMatch(
      systemPromptOf(defaultByMode.chatCalls[0]),
      /describing a software architecture/,
    );
  } finally {
    await close(first.instance);
    await close(second.instance);
  }
});

test("text-to-diagram route reads the last user message, flattening array content", async () => {
  const openai = createFakeOpenAI();
  const server = await listen(createTestApp(openai));

  try {
    await postPrompt(server.url, {
      messages: [
        { role: "user", content: "stale prompt" },
        {
          role: "user",
          content: [
            { type: "text", text: "boxes" },
            { type: "text", text: "arrows" },
          ],
        },
        { role: "assistant", content: "sure" },
      ],
    });

    assert.equal(userPromptOf(openai.chatCalls[0]), "boxes\narrows");
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route keeps buffered Mermaid when the stream closes prematurely", async () => {
  const server = await listen(createTestApp(createTruncatedStreamOpenAI({
    chunks: ["flowchart TD\n", "  A -- ok --> B"],
  })));

  try {
    const response = await postPrompt(server.url, {
      messages: [{ role: "user", content: "simple flow" }],
    });

    assert.match(response.body, /flowchart TD/);
    assert.match(response.body, /A -->\|ok\| B/);
    assert.match(response.body, /data: \[DONE\]/);
    assert.equal(response.status, 200);
  } finally {
    await close(server.instance);
  }
});

test("text-to-diagram route fails when the stream closes before any content", async () => {
  const server = await listen(createTestApp(createTruncatedStreamOpenAI({ chunks: [] })));

  try {
    const response = await postPrompt(server.url, {
      messages: [{ role: "user", content: "simple flow" }],
    });

    assert.equal(response.status, 500);
  } finally {
    await close(server.instance);
  }
});

function createTruncatedStreamOpenAI({ chunks }) {
  return {
    responses: {
      async create() {
        return { output_text: "<main>ok</main>" };
      },
    },
    chat: {
      completions: {
        async create() {
          return (async function* stream() {
            for (const content of chunks) {
              yield { choices: [{ delta: { content } }] };
            }
            throw new Error("Premature close");
          })();
        },
      },
    },
  };
}

async function postPrompt(url, body) {
  const response = await fetch(`${url}/v1/ai/text-to-diagram/chat-streaming`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.text() };
}

function systemPromptOf(call) {
  return call.messages.find((message) => message.role === "system").content;
}

function userPromptOf(call) {
  return call.messages.find((message) => message.role === "user").content;
}

function createTestApp(openai) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerExcalidrawRoutes(app, { openai, config });
  return app;
}

function createFakeOpenAI({ mermaidChunks, repairChunks } = {}) {
  const chatCalls = [];
  const defaultChunks = ["flowchart TD\n", "  A -- ok --> B"];

  return {
    chatCalls,
    responses: {
      async create() {
        return { output_text: " <main>ok</main> " };
      },
    },
    chat: {
      completions: {
        async create(params) {
          chatCalls.push(params);

          // Generation is streamed, repair is a single buffered completion.
          if (params.stream) {
            return (mermaidChunks ?? defaultChunks).map((content) => ({
              choices: [{ delta: { content } }],
            }));
          }

          const content = (repairChunks ?? mermaidChunks ?? defaultChunks).join("");
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => {
      const address = instance.address();
      resolve({
        instance,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
    instance.on("error", reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
