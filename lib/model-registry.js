// A thin capability registry over model IDs. It exists so the proxy can pick a
// model per task instead of using one model for everything, and so a
// misconfigured model is caught at startup rather than as a provider 400.
//
// It is deliberately not an abstraction layer over providers: there is one
// OpenAI client, the API key stays server-side, and nothing here talks to a
// provider. Adding a second provider means adding rows and a client, not
// rewriting the routes.
//
// Context and output limits are the provider's documented values. Quality and
// cost tiers are routing labels, not benchmarks: they encode "use the small one
// unless the task needs the big one" and operators are expected to edit them.

const QUALITY_TIERS = ["basic", "standard", "high"];
const COST_TIERS = ["low", "medium", "high"];

export const modelRegistry = {
  "gpt-4.1": {
    provider: "openai",
    supportsStreaming: true,
    supportsJson: true,
    supportsImageInput: true,
    maxOutput: 32_768,
    contextWindow: 1_047_576,
    diagramQualityTier: "high",
    costTier: "high",
  },
  "gpt-4.1-mini": {
    provider: "openai",
    supportsStreaming: true,
    supportsJson: true,
    supportsImageInput: true,
    maxOutput: 32_768,
    contextWindow: 1_047_576,
    diagramQualityTier: "standard",
    costTier: "medium",
  },
  "gpt-4.1-nano": {
    provider: "openai",
    supportsStreaming: true,
    supportsJson: true,
    supportsImageInput: true,
    maxOutput: 32_768,
    contextWindow: 1_047_576,
    diagramQualityTier: "basic",
    costTier: "low",
  },
  "gpt-4o": {
    provider: "openai",
    supportsStreaming: true,
    supportsJson: true,
    supportsImageInput: true,
    maxOutput: 16_384,
    contextWindow: 128_000,
    diagramQualityTier: "standard",
    costTier: "high",
  },
  "gpt-4o-mini": {
    provider: "openai",
    supportsStreaming: true,
    supportsJson: true,
    supportsImageInput: true,
    maxOutput: 16_384,
    contextWindow: 128_000,
    diagramQualityTier: "basic",
    costTier: "low",
  },
};

// An unlisted model is assumed capable, not assumed broken: a newer model must
// not stop working just because this table has not been updated. `known: false`
// is what suppresses limit clamping and startup warnings for it.
const UNKNOWN_MODEL = {
  provider: "unknown",
  supportsStreaming: true,
  supportsJson: true,
  supportsImageInput: true,
  maxOutput: 0,
  contextWindow: 0,
  diagramQualityTier: "unknown",
  costTier: "unknown",
};

export const modelTasks = [
  "text-to-diagram",
  "text-to-diagram:architecture",
  "mermaid-repair",
  "diagram-to-code",
];

// What each task actually needs from a model, and what to optimize for when
// more than one candidate qualifies.
const TASK_REQUIREMENTS = {
  "text-to-diagram": {
    requires: ["supportsStreaming"],
    minQuality: "basic",
    prefer: "cost",
    configKey: "textToDiagramModel",
    fallbacks: ["defaultModel"],
  },
  "text-to-diagram:architecture": {
    requires: ["supportsStreaming"],
    minQuality: "standard",
    prefer: "quality",
    configKey: "architectureModel",
    fallbacks: ["textToDiagramModel", "defaultModel"],
  },
  "mermaid-repair": {
    // The repair pass is a constrained rewrite, not a creative one: it wants a
    // small model that follows the output format, not the strongest one.
    requires: ["supportsJson"],
    minQuality: "basic",
    prefer: "cost",
    configKey: "repairModel",
    fallbacks: ["textToDiagramModel", "defaultModel"],
  },
  "diagram-to-code": {
    requires: ["supportsImageInput"],
    minQuality: "standard",
    prefer: "quality",
    configKey: "diagramToCodeModel",
    fallbacks: ["defaultModel"],
  },
};

export function modelCapabilities(modelId) {
  const entry = modelRegistry[modelId];

  if (!entry) {
    return { id: modelId || "", known: false, ...UNKNOWN_MODEL };
  }

  return { id: modelId, known: true, ...entry };
}

/**
 * Resolves the model for a task. An explicitly configured model always wins —
 * the proxy never silently spends money on a model the operator did not name.
 * `modelPool` is the opt-in: list the models the proxy may choose from and the
 * task requirements above pick between them.
 */
export function selectModel(task, config = {}) {
  const requirements = TASK_REQUIREMENTS[task];

  if (!requirements) {
    return { model: config.defaultModel || "", task, reason: "unknown_task" };
  }

  const explicit = config[requirements.configKey];
  if (explicit) {
    return { model: explicit, task, reason: "configured" };
  }

  const pooled = selectFromPool(config.modelPool, requirements);
  if (pooled) {
    return { model: pooled, task, reason: "pool" };
  }

  for (const key of requirements.fallbacks) {
    if (config[key]) {
      return { model: config[key], task, reason: "fallback" };
    }
  }

  return { model: "", task, reason: "unresolved" };
}

// Keeps a configured token budget inside a known model's documented output
// limit. Unknown models are left alone: guessing a cap would be worse than
// letting the provider answer.
export function clampMaxOutput(modelId, requestedTokens) {
  const { maxOutput } = modelCapabilities(modelId);

  if (!maxOutput || !requestedTokens) {
    return requestedTokens;
  }

  return Math.min(requestedTokens, maxOutput);
}

/**
 * Startup check: reports known models used for a task they cannot perform, for
 * example a text-to-diagram model that cannot stream. Unknown models are not
 * reported — the table, not the model, is what is out of date there.
 */
export function validateModelRouting(config = {}) {
  const problems = [];

  for (const task of modelTasks) {
    const { model } = selectModel(task, config);
    if (!model) {
      problems.push({ task, model: "", problem: "no_model_resolved" });
      continue;
    }

    const capabilities = modelCapabilities(model);
    if (!capabilities.known) {
      continue;
    }

    for (const requirement of TASK_REQUIREMENTS[task].requires) {
      if (!capabilities[requirement]) {
        problems.push({ task, model, problem: `missing_${requirement}` });
      }
    }
  }

  return problems;
}

export function resolveModelRouting(config = {}) {
  const routing = {};

  for (const task of modelTasks) {
    routing[task] = selectModel(task, config);
  }

  return routing;
}

export function parseModelPool(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function selectFromPool(modelPool, requirements) {
  const candidates = (modelPool || [])
    .map((modelId) => modelCapabilities(modelId))
    .filter((candidate) => candidate.known)
    .filter((candidate) => requirements.requires.every((flag) => candidate[flag]))
    .filter(
      (candidate) => tierIndex(QUALITY_TIERS, candidate.diagramQualityTier) >= tierIndex(QUALITY_TIERS, requirements.minQuality),
    );

  if (candidates.length === 0) {
    return "";
  }

  candidates.sort(requirements.prefer === "quality" ? byQualityThenCost : byCostThenQuality);
  return candidates[0].id;
}

function byCostThenQuality(a, b) {
  return (
    tierIndex(COST_TIERS, a.costTier) - tierIndex(COST_TIERS, b.costTier) ||
    tierIndex(QUALITY_TIERS, b.diagramQualityTier) - tierIndex(QUALITY_TIERS, a.diagramQualityTier)
  );
}

function byQualityThenCost(a, b) {
  return (
    tierIndex(QUALITY_TIERS, b.diagramQualityTier) - tierIndex(QUALITY_TIERS, a.diagramQualityTier) ||
    tierIndex(COST_TIERS, a.costTier) - tierIndex(COST_TIERS, b.costTier)
  );
}

function tierIndex(tiers, tier) {
  return tiers.indexOf(tier);
}
