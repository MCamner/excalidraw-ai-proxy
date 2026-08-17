import { handleHttpError } from "./http-middleware.js";
import { repairAttemptLimit, repairMermaid } from "./mermaid-repair.js";
import {
  clampMaxOutput,
  modelCapabilities,
  resolveModelRouting,
  selectModel,
} from "./model-registry.js";
import { promptContractModes, resolveContractMode, systemPromptFor } from "./prompt-contracts.js";

export function buildCapabilities(config) {
  const {
    mermaidAutoRepair,
    maxPromptChars,
    textToDiagramMaxTokens,
    diagramToCodeMaxTokens,
    mermaidMaxNodes = 0,
  } = config;
  const mermaidMaxRepairAttempts = repairAttemptLimit(config);
  const routing = resolveModelRouting(config);

  return {
    ok: true,
    features: {
      textToDiagram: true,
      diagramToCode: true,
      streaming: true,
      streamingMode: "buffered-after-repair",
      mermaidAutoRepair,
      mermaidTargetedRepair: Boolean(mermaidAutoRepair) && mermaidMaxRepairAttempts > 0,
      modelRouting: true,
      promptContractModes,
    },
    endpoints: {
      health: "GET /health",
      capabilities: "GET /v1/ai/capabilities",
      textToDiagram: "POST /v1/ai/text-to-diagram/chat-streaming",
      diagramToCode: "POST /v1/ai/diagram-to-code/generate",
    },
    models: {
      textToDiagram: routing["text-to-diagram"].model,
      textToDiagramArchitecture: routing["text-to-diagram:architecture"].model,
      mermaidRepair: routing["mermaid-repair"].model,
      diagramToCode: routing["diagram-to-code"].model,
    },
    modelRouting: Object.fromEntries(
      Object.entries(routing).map(([task, selection]) => [
        task,
        { model: selection.model, reason: selection.reason, ...describeModel(selection.model) },
      ]),
    ),
    limits: {
      maxPromptChars,
      textToDiagramMaxTokens,
      diagramToCodeMaxTokens,
      mermaidMaxRepairAttempts,
      mermaidMaxNodes,
    },
  };
}

// Capability metadata only: model IDs and tiers, never credentials.
function describeModel(modelId) {
  const capabilities = modelCapabilities(modelId);

  return {
    known: capabilities.known,
    provider: capabilities.provider,
    supportsStreaming: capabilities.supportsStreaming,
    supportsJson: capabilities.supportsJson,
    supportsImageInput: capabilities.supportsImageInput,
    maxOutput: capabilities.maxOutput,
    diagramQualityTier: capabilities.diagramQualityTier,
    costTier: capabilities.costTier,
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

      const { model } = selectModel("diagram-to-code", config);
      const response = await openai.responses.create({
        model,
        max_output_tokens: clampMaxOutput(model, config.diagramToCodeMaxTokens),
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
      const { messages, mode } = req.body || {};

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).send("Missing messages");
      }

      const prompt = getLastUserMessage(messages);
      if (prompt.length > config.maxPromptChars) {
        return res.status(413).send(`Prompt is too long. Max ${config.maxPromptChars} characters.`);
      }

      // The contract decides the model: an architecture diagram is the case
      // worth a stronger model, an ordinary flowchart is not.
      const contractMode = resolveContractMode(prompt, { mode });
      const { model } = selectModel(
        contractMode === "architecture" ? "text-to-diagram:architecture" : "text-to-diagram",
        config,
      );

      const stream = await openai.chat.completions.create({
        model,
        stream: true,
        temperature: config.textToDiagramTemperature,
        max_tokens: clampMaxOutput(model, config.textToDiagramMaxTokens),
        messages: [
          {
            role: "system",
            content: systemPromptFor(prompt, { mode: contractMode }),
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

      const normalization = await repairMermaid(rawMermaid, { openai, config, prompt });
      const { mermaid } = normalization;
      res.locals.mermaidRepair = normalization;
      logMermaidRepairReport(normalization);

      // Soft failures (importable but flawed) are served: a diagram that is
      // bigger than we would like still beats no diagram.
      if (normalization.severity === "hard") {
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

// Logs failure classes and outcomes only. Diagram source and prompts stay out
// of the log line on purpose.
function logMermaidRepairReport(report) {
  if (!report.repairApplied && !report.errorType) {
    return;
  }

  console.info(
    JSON.stringify({
      event: "mermaid_repair",
      repairApplied: Boolean(report.repairApplied),
      autoRepairApplied: Boolean(report.autoRepairApplied),
      repairReasons: report.repairReasons,
      errorType: report.errorType || undefined,
      severity: report.severity || undefined,
      nodeCount: report.nodeCount,
      repairAttempts: report.repairAttempts,
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
