import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3016);
const host = process.env.HOST || "127.0.0.1";
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "10mb";
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.ALLOWED_ORIGIN ||
  "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const textToDiagramModel = process.env.OPENAI_TEXT_TO_DIAGRAM_MODEL || model;
const diagramToCodeModel = process.env.OPENAI_DIAGRAM_TO_CODE_MODEL || model;
const openaiTimeoutMs = numberFromEnv("OPENAI_TIMEOUT_MS", 45_000);
const openaiMaxRetries = numberFromEnv("OPENAI_MAX_RETRIES", 2);
const textToDiagramTemperature = numberFromEnv("TEXT_TO_DIAGRAM_TEMPERATURE", 0.1);
const textToDiagramMaxTokens = numberFromEnv("TEXT_TO_DIAGRAM_MAX_TOKENS", 1600);
const diagramToCodeMaxTokens = numberFromEnv("DIAGRAM_TO_CODE_MAX_TOKENS", 4000);
const maxPromptChars = numberFromEnv("MAX_PROMPT_CHARS", 6000);
const rateLimitWindowMs = numberFromEnv("RATE_LIMIT_WINDOW_MS", 60_000);
const rateLimitMaxRequests = numberFromEnv("RATE_LIMIT_MAX_REQUESTS", 20);
const mermaidAutoRepair = booleanFromEnv("MERMAID_AUTO_REPAIR", true);

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. API calls will fail until .env is configured.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: openaiTimeoutMs,
  maxRetries: openaiMaxRetries,
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
  }),
);
app.use(rateLimit({ windowMs: rateLimitWindowMs, maxRequests: rateLimitMaxRequests }));
app.use(express.json({ limit: jsonBodyLimit }));
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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
      model: diagramToCodeModel,
      max_output_tokens: diagramToCodeMaxTokens,
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
    handleError(error, res);
  }
});

app.post("/v1/ai/text-to-diagram/chat-streaming", async (req, res) => {
  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).send("Missing messages");
    }

    const prompt = getLastUserMessage(messages);
    if (prompt.length > maxPromptChars) {
      return res.status(413).send(`Prompt is too long. Max ${maxPromptChars} characters.`);
    }

    const stream = await openai.chat.completions.create({
      model: textToDiagramModel,
      stream: true,
      temperature: textToDiagramTemperature,
      max_tokens: textToDiagramMaxTokens,
      messages: [
        {
          role: "system",
          content:
            "You generate valid Mermaid source for Excalidraw's Mermaid parser. Return only Mermaid code, no markdown fences, no explanation. For general requests use flowchart TD. Use simple ASCII node IDs like A, B, C. Use node labels like A[Start] and decisions like C{Valid?}. Use edge labels only in pipe form, for example C -->|Yes| D. Never use JSON, HTML, Excalidraw element objects, or prose.",
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

    const mermaid = await normalizeMermaid(rawMermaid);

    if (!mermaid) {
      return res.status(502).send("OpenAI returned an empty Mermaid diagram");
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
      handleError(error, res);
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

app.use((err, _req, res, _next) => {
  handleError(err, res);
});

app.listen(port, host, () => {
  console.log(`Excalidraw AI proxy listening on http://${host}:${port}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});

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

function rateLimit({ windowMs, maxRequests }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "local";
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        message: "Too many requests",
        retryAfterSeconds,
      });
      return;
    }

    next();
  };
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

function sanitizeMermaid(text) {
  let mermaid = text
    .replace(/```mermaid/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstMermaidLine = mermaid.search(
    /^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram)\b/im,
  );
  if (firstMermaidLine > 0) {
    mermaid = mermaid.slice(firstMermaidLine).trim();
  }

  mermaid = mermaid
    .split("\n")
    .map((line) =>
      line
        .replace(/\s+$/g, "")
        .replace(/(\w+)\s+--\s+([^|-][^-]*?)\s+-->\s+(\w+)/g, (_match, from, label, to) => {
          return `${from} -->|${label.trim()}| ${to}`;
        }),
    )
    .filter((line) => line.trim() && !/^Here(?:'s| is)\b/i.test(line.trim()))
    .join("\n");

  if (!/^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram)\b/i.test(mermaid)) {
    mermaid = `flowchart TD\n${mermaid}`;
  }

  return mermaid;
}

async function normalizeMermaid(rawMermaid) {
  const mermaid = sanitizeMermaid(rawMermaid);

  if (!mermaidAutoRepair || isProbablyValidMermaid(mermaid)) {
    return mermaid;
  }

  return repairMermaid(mermaid);
}

function isProbablyValidMermaid(mermaid) {
  const lines = mermaid
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return false;
  }

  if (!/^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram)\b/i.test(lines[0])) {
    return false;
  }

  return lines.some((line) => /(-->|---|==>|-.->|:|\{|\[)/.test(line));
}

async function repairMermaid(mermaid) {
  const response = await openai.chat.completions.create({
    model: textToDiagramModel,
    temperature: 0,
    max_tokens: textToDiagramMaxTokens,
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

  return sanitizeMermaid(response.choices?.[0]?.message?.content || mermaid);
}

function chunkText(text, size) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function booleanFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return /^(1|true|yes|on)$/i.test(value);
}

function handleError(error, res) {
  const status = error?.status || error?.statusCode || 500;
  const message = error instanceof Error ? error.message : "Unexpected server error";

  res.status(status).json({
    message,
    statusCode: status,
  });
}
