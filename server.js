import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { pathToFileURL } from "url";
import { buildCapabilities, registerExcalidrawRoutes } from "./lib/excalidraw-routes.js";
import {
  createCorsOptions,
  createRateLimiter,
  handleHttpError,
} from "./lib/http-middleware.js";
import { sanitizeMermaid, sanitizeMermaidWithReport } from "./lib/mermaid-sanitize.js";
import { parseModelPool, validateModelRouting } from "./lib/model-registry.js";
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
// Per-task models are read as "set or not set", not defaulted here: the model
// registry resolves each task as configured -> pool -> fallback, and defaulting
// early would make the pool unreachable.
const defaultModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const textToDiagramModel = process.env.OPENAI_TEXT_TO_DIAGRAM_MODEL || "";
const diagramToCodeModel = process.env.OPENAI_DIAGRAM_TO_CODE_MODEL || "";
const architectureModel = process.env.OPENAI_ARCHITECTURE_MODEL || "";
const repairModel = process.env.OPENAI_REPAIR_MODEL || "";
const modelPool = parseModelPool(process.env.OPENAI_MODEL_POOL);
const openaiTimeoutMs = numberFromEnv("OPENAI_TIMEOUT_MS", 45_000);
const openaiMaxRetries = numberFromEnv("OPENAI_MAX_RETRIES", 2);
const textToDiagramTemperature = numberFromEnv("TEXT_TO_DIAGRAM_TEMPERATURE", 0.1);
const textToDiagramMaxTokens = numberFromEnv("TEXT_TO_DIAGRAM_MAX_TOKENS", 1600);
const diagramToCodeMaxTokens = numberFromEnv("DIAGRAM_TO_CODE_MAX_TOKENS", 4000);
const maxPromptChars = numberFromEnv("MAX_PROMPT_CHARS", 6000);
const rateLimitWindowMs = numberFromEnv("RATE_LIMIT_WINDOW_MS", 60_000);
const rateLimitMaxRequests = numberFromEnv("RATE_LIMIT_MAX_REQUESTS", 20);
const mermaidAutoRepair = booleanFromEnv("MERMAID_AUTO_REPAIR", true);
// Targeted repair passes after the deterministic sanitizer. Capped at 2 by
// lib/mermaid-repair.js so a bad generation cannot turn into a retry storm.
const mermaidMaxRepairAttempts = boundedNumberFromEnv("MERMAID_MAX_REPAIR_ATTEMPTS", 1, 0, 2);
// Soft node budget: above this the proxy asks the model once for a smaller
// diagram, but never fails a request that already parses. 0 disables the check.
const mermaidMaxNodes = boundedNumberFromEnv("MERMAID_MAX_NODES", 60, 0, 500);
const routeConfig = {
  defaultModel,
  textToDiagramModel,
  diagramToCodeModel,
  architectureModel,
  repairModel,
  modelPool,
  textToDiagramTemperature,
  textToDiagramMaxTokens,
  diagramToCodeMaxTokens,
  maxPromptChars,
  mermaidAutoRepair,
  mermaidMaxRepairAttempts,
  mermaidMaxNodes,
};

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. API calls will fail until .env is configured.");
}

// A model routed to a task it cannot perform fails as a provider error on the
// first real request. Say so at startup instead.
for (const problem of validateModelRouting(routeConfig)) {
  console.warn(
    `Model routing: ${problem.task} resolves to "${problem.model}" (${problem.problem}).`,
  );
}

const openai = createOpenAIClient({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: openaiTimeoutMs,
  maxRetries: openaiMaxRetries,
});

app.use(cors(createCorsOptions(allowedOrigins)));
app.use(createRateLimiter({ windowMs: rateLimitWindowMs, maxRequests: rateLimitMaxRequests }));
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
        mermaidErrorType: repair?.errorType || undefined,
        mermaidRepairAttempts: repair?.repairAttempts?.length || 0,
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
  handleHttpError(err, res);
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

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Unlike numberFromEnv, this accepts 0 (a documented "off" value) and clamps
// instead of silently falling back, so a typo cannot widen a safety limit.
function boundedNumberFromEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function booleanFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return /^(1|true|yes|on)$/i.test(value);
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
