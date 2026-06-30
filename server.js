import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3016);
const host = process.env.HOST || "127.0.0.1";
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.ALLOWED_ORIGIN ||
  "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. API calls will fail until .env is configured.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
app.use(express.json({ limit: "10mb" }));
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
      model,
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

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const stream = await openai.responses.stream({
      model,
      input: [
        {
          role: "system",
          content:
            "You help Excalidraw create diagrams. Return diagram instructions in the same text format requested by the client. Do not include markdown fences unless explicitly requested.",
        },
        ...messages.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: normalizeMessageContent(message.content),
        })),
      ],
    });

    let sawContent = false;

    try {
      for await (const event of stream) {
        if (event.type === "response.output_text.delta" && event.delta) {
          sawContent = true;
          writeSse(res, {
            type: "content",
            delta: event.delta,
          });
        }
      }
    } catch (streamError) {
      if (!sawContent || !isPrematureClose(streamError)) {
        throw streamError;
      }
      console.warn("OpenAI stream ended with premature close after content; treating as complete.");
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

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function isPrematureClose(error) {
  return error instanceof Error && /premature close/i.test(error.message);
}

function handleError(error, res) {
  const status = error?.status || error?.statusCode || 500;
  const message = error instanceof Error ? error.message : "Unexpected server error";

  res.status(status).json({
    message,
    statusCode: status,
  });
}
