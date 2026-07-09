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
  maxPromptChars: 6000,
  mermaidAutoRepair: true,
};

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

function createTestApp(openai) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerExcalidrawRoutes(app, { openai, config });
  return app;
}

function createFakeOpenAI() {
  return {
    responses: {
      async create() {
        return { output_text: " <main>ok</main> " };
      },
    },
    chat: {
      completions: {
        async create() {
          return [
            { choices: [{ delta: { content: "flowchart TD\n" } }] },
            { choices: [{ delta: { content: "  A -- ok --> B" } }] },
          ];
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
