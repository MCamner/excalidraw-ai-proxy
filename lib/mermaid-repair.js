import {
  classifyUpstreamError,
  compareDiagnoses,
  diagnoseMermaid,
  mermaidErrorTypes,
} from "./mermaid-diagnostics.js";
import { sanitizeMermaidWithReport } from "./mermaid-sanitize.js";
import { clampMaxOutput, selectModel } from "./model-registry.js";

// Hard cap, independent of configuration: a repair loop that keeps going is a
// latency and cost problem, not a quality one.
export const MAX_REPAIR_ATTEMPTS = 2;
const DEFAULT_REPAIR_ATTEMPTS = 1;

const REPAIR_SYSTEM_PROMPT =
  "You repair Mermaid source so Excalidraw's Mermaid parser can import it. Apply the smallest fix that resolves the reported error while preserving the diagram's meaning and main relationships. Return only Mermaid source, no markdown fences and no explanation.";

// One instruction per failure class. This is the whole point of classifying:
// the model gets the specific correction, not "the diagram was invalid".
const REPAIR_INSTRUCTIONS = {
  [mermaidErrorTypes.emptyDiagram]:
    "The output was empty. Return a complete flowchart TD diagram for the same content.",
  [mermaidErrorTypes.unknownDiagramType]:
    "The first line is not a Mermaid diagram header. Start the output with flowchart TD and keep the rest of the content.",
  [mermaidErrorTypes.unbalancedSubgraph]:
    "A subgraph block is not balanced. Every subgraph must be closed by exactly one end line on its own, and there must be no extra end lines.",
  [mermaidErrorTypes.reservedNodeId]:
    "end is a reserved word in Mermaid and cannot be a node ID. Rename that node, for example end to finish, and update every edge that refers to it.",
  [mermaidErrorTypes.invalidNodeId]:
    "A node ID is not a single token. Node IDs must be ASCII without spaces; move the descriptive text into the label, for example my node[Label] becomes N1[\"my node\"].",
  [mermaidErrorTypes.unquotedLabel]:
    "A label contains punctuation that Mermaid reads as syntax. Wrap every node, subgraph, and edge label containing parentheses, slashes, colons, ampersands, or angle brackets in double quotes.",
  [mermaidErrorTypes.syntaxError]:
    "Fix the syntax error reported by the Mermaid parser without changing the diagram's meaning.",
  [mermaidErrorTypes.unsupportedDiagramType]:
    "Excalidraw can only import flowchart, sequence, and class diagrams. Rewrite the diagram as flowchart TD, keeping the same entities and relationships.",
};

/**
 * Deterministic sanitizing first, then up to `mermaidMaxRepairAttempts` targeted
 * model repairs driven by the classified failure. Returns the best candidate
 * seen, so a retry can never make the response worse than the first attempt.
 */
export async function repairMermaid(rawMermaid, { openai, config = {}, prompt = "" } = {}) {
  const maxNodes = config.mermaidMaxNodes || 0;
  const maxAttempts = repairAttemptLimit(config);
  const sanitized = sanitizeMermaidWithReport(rawMermaid);
  const repairReasons = [...sanitized.repairReasons];
  const attempts = [];

  let best = {
    mermaid: sanitized.mermaid,
    diagnosis: await diagnoseMermaid(sanitized.mermaid, { maxNodes }),
  };

  if (best.diagnosis.ok || !config.mermaidAutoRepair || maxAttempts === 0) {
    return buildReport({ best, repairReasons, attempts });
  }

  let current = best;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const errorType = current.diagnosis.errorType;
    let candidate;

    try {
      candidate = await requestRepair(current, { openai, config, prompt });
    } catch (error) {
      attempts.push({ attempt, errorType, outcome: classifyUpstreamError(error) });
      break;
    }

    const repaired = sanitizeMermaidWithReport(candidate);
    const diagnosis = await diagnoseMermaid(repaired.mermaid, { maxNodes });
    const next = { mermaid: repaired.mermaid, diagnosis };

    attempts.push({ attempt, errorType, outcome: repairOutcome(current.diagnosis, diagnosis) });

    if (compareDiagnoses(diagnosis, best.diagnosis) > 0) {
      best = next;
      for (const reason of repaired.repairReasons) {
        if (!repairReasons.includes(reason)) {
          repairReasons.push(reason);
        }
      }
    }

    if (diagnosis.ok) {
      break;
    }

    // Never retry from a candidate that came back worse than what we sent.
    current = compareDiagnoses(next.diagnosis, current.diagnosis) >= 0 ? next : current;
  }

  if (attempts.length > 0 && !repairReasons.includes("openai_auto_repair")) {
    repairReasons.push("openai_auto_repair");
  }

  return buildReport({ best, repairReasons, attempts });
}

export function repairAttemptLimit(config = {}) {
  const configured = Number(config.mermaidMaxRepairAttempts);

  if (!Number.isFinite(configured)) {
    return DEFAULT_REPAIR_ATTEMPTS;
  }

  return Math.min(Math.max(Math.trunc(configured), 0), MAX_REPAIR_ATTEMPTS);
}

// Exported so the repair prompt is testable without a model call.
export function buildRepairPrompt(diagnosis, mermaid, { prompt = "", maxNodes = 0 } = {}) {
  const instruction = repairInstruction(diagnosis, { maxNodes });
  // An empty diagram carries nothing to repair, so this is the one class where
  // the model needs the original request back to produce anything at all.
  const includeRequest = diagnosis.errorType === mermaidErrorTypes.emptyDiagram && Boolean(prompt);

  return [
    `Error type: ${diagnosis.errorType}`,
    instruction,
    diagnosis.detail ? `Parser report:\n${diagnosis.detail}` : "",
    includeRequest ? `Original request:\n${prompt}` : "",
    `Mermaid source:\n${mermaid}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function repairInstruction(diagnosis, { maxNodes }) {
  if (diagnosis.errorType === mermaidErrorTypes.nodeLimitExceeded) {
    const limit = Number(maxNodes) > 0 ? Math.trunc(Number(maxNodes)) : 0;
    return [
      limit > 0
        ? `Reduce the Mermaid diagram to at most ${limit} semantic nodes.`
        : "Reduce the Mermaid diagram until it is within the configured node limit.",
      "Count every declared node exactly once before returning the result.",
      "Merge or collapse intermediate steps before removing terminal states or decision points.",
      "Preserve the main flow and important relationships.",
      "Subgraphs improve grouping but do not reduce the node count.",
      limit > 0 ? `Verify that the final node count is ${limit} or fewer.` : "Verify the final node count before returning.",
    ].join(" ");
  }

  return REPAIR_INSTRUCTIONS[diagnosis.errorType] || REPAIR_INSTRUCTIONS[mermaidErrorTypes.syntaxError];
}

async function requestRepair(current, { openai, config, prompt }) {
  const { model } = selectModel("mermaid-repair", config);
  const response = await openai.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: clampMaxOutput(model, config.textToDiagramMaxTokens),
    messages: [
      {
        role: "system",
        content: REPAIR_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildRepairPrompt(current.diagnosis, current.mermaid, {
          prompt,
          maxNodes: config.mermaidMaxNodes,
        }),
      },
    ],
  });

  return response.choices?.[0]?.message?.content || current.mermaid;
}

function repairOutcome(before, after) {
  if (after.ok) {
    return "resolved";
  }
  if (compareDiagnoses(after, before) > 0) {
    return "improved";
  }
  return "unresolved";
}

function buildReport({ best, repairReasons, attempts }) {
  return {
    mermaid: best.mermaid,
    repairApplied: repairReasons.length > 0,
    repairReasons,
    autoRepairApplied: attempts.length > 0,
    errorType: best.diagnosis.errorType,
    severity: best.diagnosis.severity,
    diagramType: best.diagnosis.diagramType,
    nodeCount: best.diagnosis.nodeCount,
    repairAttempts: attempts,
  };
}
