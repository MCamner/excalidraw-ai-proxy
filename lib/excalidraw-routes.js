import { handleHttpError } from "./http-middleware.js";
import { isValidMermaid, sanitizeMermaidWithReport } from "./mermaid-sanitize.js";
import { systemPromptFor } from "./prompt-contracts.js";

export function buildCapabilities({
  mermaidAutoRepair,
  textToDiagramModel,
  diagramToCodeModel,
  maxPromptChars,
  textToDiagramMaxTokens,
  diagramToCodeMaxTokens,
}) {
  return {
    ok: true,
    features: {
      textToDiagram: true,
      diagramToCode: true,
      streaming: true,
      streamingMode: "buffered-after-repair",
      mermaidAutoRepair,
    },
    endpoints: {
      health: "GET /health",
      capabilities: "GET /v1/ai/capabilities",
      textToDiagram: "POST /v1/ai/text-to-diagram/chat-streaming",
      diagramToCode: "POST /v1/ai/diagram-to-code/generate",
    },
    models: {
      textToDiagram: textToDiagramModel,
      diagramToCode: diagramToCodeModel,
    },
    limits: {
      maxPromptChars,
      textToDiagramMaxTokens,
      diagramToCodeMaxTokens,
    },
  };
}

export function registerExcalidrawRoutes(app, { openai, config }) {
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/v1/ai/capabilities", (_req, res) => {
    res.json(buildCapabilities(config));
  });

  app.post("/v1/ai/diagram-to-code/generate", async (req, res) => {
    try {
      const { texts, image, theme } = req.body || {};

      if (!image || typeof image !== "string") {
        return res.status(400).json({ message: "Missing image" });
      }

      const textSummary = Array.isArray(texts)
        ? texts.filter(Boolean).join("\n")
        : typeof texts === "string"
          ? texts
          : "";

      const response = await openai.responses.create({
        model: config.diagramToCodeModel,
        max_output_tokens: config.diagramToCodeMaxTokens,
        input: [
          {
            role: "system",
            content:
              "You convert Excalidraw wireframes into a single self-contained HTML document. Return only HTML.",
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Generate clean, responsive HTML/CSS for this diagram.",
                  `Theme: ${theme || "light"}`,
                  textSummary ? `Text found in diagram:\n${textSummary}` : "",
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
              {
                type: "input_image",
                image_url: image,
                detail: "high",
              },
            ],
          },
        ],
      });

      const html = response.output_text?.trim();

      if (!html) {
        return res.status(502).json({ message: "OpenAI returned an empty response" });
      }

      res.json({ html });
    } catch (error) {
      handleHttpError(error, res);
    }
  });

  app.post("/v1/ai/text-to-diagram/chat-streaming", async (req, res) => {
    try {
      const { messages } = req.body || {};

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).send("Missing messages");
      }

      const prompt = getLastUserMessage(messages);
      if (prompt.length > config.maxPromptChars) {
        return res.status(413).send(`Prompt is too long. Max ${config.maxPromptChars} characters.`);
      }

      const stream = await openai.chat.completions.create({
        model: config.textToDiagramModel,
        stream: true,
        temperature: config.textToDiagramTemperature,
        max_tokens: config.textToDiagramMaxTokens,
        messages: [
          {
            role: "system",
            content: systemPromptFor(prompt),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      let rawMermaid = "";

      try {
        for await (const event of stream) {
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) {
            rawMermaid += delta;
          }
        }
      } catch (streamError) {
        if (!rawMermaid || !isPrematureClose(streamError)) {
          throw streamError;
        }
        console.warn("OpenAI stream ended with premature close after content; normalizing buffered Mermaid.");
      }

      if (!rawMermaid.trim()) {
        return res.status(502).send("OpenAI returned an empty Mermaid diagram");
      }

      const normalization = await normalizeMermaid(rawMermaid, { openai, config });
      const { mermaid } = normalization;
      res.locals.mermaidRepair = normalization;
      logMermaidRepairReport(normalization);

      if (!(await isValidMermaid(mermaid))) {
        return res.status(502).send("OpenAI returned invalid Mermaid after repair");
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      for (const chunk of chunkText(mermaid, 80)) {
        writeSse(res, {
          type: "content",
          delta: chunk,
        });
      }

      writeSse(res, {
        type: "done",
        finishReason: "stop",
      });
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      if (!res.headersSent) {
        handleHttpError(error, res);
        return;
      }

      writeSse(res, {
        type: "error",
        error: {
          message: error instanceof Error ? error.message : "Streaming failed",
        },
      });
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });
}

function normalizeMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function isPrematureClose(error) {
  return error instanceof Error && /premature close/i.test(error.message);
}

function getLastUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === "user") {
      return normalizeMessageContent(message.content);
    }
  }

  return normalizeMessageContent(messages[messages.length - 1]?.content);
}

async function normalizeMermaid(rawMermaid, { openai, config }) {
  const sanitized = sanitizeMermaidWithReport(rawMermaid);

  if (!config.mermaidAutoRepair || (await isValidMermaid(sanitized.mermaid))) {
    return sanitized;
  }

  const repaired = await repairMermaid(sanitized.mermaid, { openai, config });
  const repairReasons = uniqueRepairReasons([
    ...sanitized.repairReasons,
    "openai_auto_repair",
    ...repaired.repairReasons,
  ]);

  return {
    mermaid: repaired.mermaid,
    repairApplied: true,
    repairReasons,
    autoRepairApplied: true,
  };
}

async function repairMermaid(mermaid, { openai, config }) {
  const response = await openai.chat.completions.create({
    model: config.textToDiagramModel,
    temperature: 0,
    max_tokens: config.textToDiagramMaxTokens,
    messages: [
      {
        role: "system",
        content:
          "Repair Mermaid source so Excalidraw's Mermaid parser can import it. Return only Mermaid source, no markdown fences and no explanation. Prefer flowchart TD if the diagram type is unclear.",
      },
      {
        role: "user",
        content: mermaid,
      },
    ],
  });

  return sanitizeMermaidWithReport(response.choices?.[0]?.message?.content || mermaid);
}

function uniqueRepairReasons(repairReasons) {
  return [...new Set(repairReasons)];
}

function logMermaidRepairReport(report) {
  if (!report.repairApplied) {
    return;
  }

  console.info(
    JSON.stringify({
      event: "mermaid_repair",
      repairApplied: true,
      autoRepairApplied: Boolean(report.autoRepairApplied),
      repairReasons: report.repairReasons,
    }),
  );
}

function chunkText(text, size) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}
