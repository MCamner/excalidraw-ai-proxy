import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { pathToFileURL } from "url";
import { buildCapabilities, registerExcalidrawRoutes } from "./lib/excalidraw-routes.js";
import { sanitizeMermaid, sanitizeMermaidWithReport } from "./lib/mermaid-sanitize.js";
import { createOpenAIClient } from "./lib/openai-client.js";

export { sanitizeMermaid, sanitizeMermaidWithReport };

dotenv.config();

export const app = express();
const port = Number(process.env.PORT || 3016);
const host = process.env.HOST || "127.0.0.1";
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "10mb";
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.ALLOWED_ORIGIN ||
  "http://localhost:3003,http://127.0.0.1:3003"
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
const routeConfig = {
  textToDiagramModel,
  diagramToCodeModel,
  textToDiagramTemperature,
  textToDiagramMaxTokens,
  diagramToCodeMaxTokens,
  maxPromptChars,
  mermaidAutoRepair,
};

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. API calls will fail until .env is configured.");
}

const openai = createOpenAIClient({
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
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  res.on("finish", () => {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const repair = res.locals.mermaidRepair;
    console.info(
      JSON.stringify({
        event: "request_completed",
        endpoint: `${req.method} ${req.path}`,
        statusCode: res.statusCode,
        latencyMs: Math.round(latencyMs),
        repairApplied: Boolean(repair?.repairApplied),
        autoRepairApplied: Boolean(repair?.autoRepairApplied),
        repairReasons: repair?.repairReasons || [],
        errorType: res.statusCode >= 400 ? responseErrorType(res.statusCode) : undefined,
      }),
    );
  });
  next();
});

registerExcalidrawRoutes(app, {
  openai,
  config: routeConfig,
});

app.use((err, _req, res, _next) => {
  handleError(err, res);
});

if (isMainModule()) {
  app.listen(port, host, () => {
    console.log(`Excalidraw AI proxy listening on http://${host}:${port}`);
    console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
  });
}

export function getCapabilities() {
  return buildCapabilities(routeConfig);
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

function responseErrorType(statusCode) {
  if (statusCode === 400) {
    return "bad_request";
  }
  if (statusCode === 413) {
    return "payload_too_large";
  }
  if (statusCode === 429) {
    return "rate_limited";
  }
  if (statusCode >= 500) {
    return "upstream_or_proxy_error";
  }
  return "http_error";
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
