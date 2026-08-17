import { parseMermaidWithError } from "./mermaid-parser.js";

// Why a diagnosis and not just a boolean: "invalid Mermaid" is not one failure.
// A missing `end`, a node ID with a space, and a diagram type Excalidraw cannot
// import all need different corrections. Classifying the failure lets the repair
// pass tell the model exactly what to fix instead of "try again".
export const mermaidErrorTypes = {
  emptyDiagram: "empty_diagram",
  unknownDiagramType: "unknown_diagram_type",
  unbalancedSubgraph: "unbalanced_subgraph",
  reservedNodeId: "reserved_node_id",
  invalidNodeId: "invalid_node_id",
  unquotedLabel: "unquoted_label",
  syntaxError: "syntax_error",
  unsupportedDiagramType: "unsupported_diagram_type",
  nodeLimitExceeded: "node_limit_exceeded",
  upstreamTimeout: "upstream_timeout",
  upstreamError: "upstream_error",
};

// hard: the diagram cannot be imported at all, the request fails without a fix.
// soft: the diagram parses and is importable, but is worse than it should be.
// A soft failure may trigger one retry; it never fails the request.
export const mermaidErrorSeverity = {
  [mermaidErrorTypes.emptyDiagram]: "hard",
  [mermaidErrorTypes.unknownDiagramType]: "hard",
  [mermaidErrorTypes.unbalancedSubgraph]: "hard",
  [mermaidErrorTypes.reservedNodeId]: "hard",
  [mermaidErrorTypes.invalidNodeId]: "hard",
  [mermaidErrorTypes.unquotedLabel]: "hard",
  [mermaidErrorTypes.syntaxError]: "hard",
  [mermaidErrorTypes.unsupportedDiagramType]: "soft",
  [mermaidErrorTypes.nodeLimitExceeded]: "soft",
};

// Diagram types Excalidraw's Mermaid import understands. Anything else parses
// fine and then fails or degrades on import, which is why it is classified.
const IMPORTABLE_DIAGRAM_TYPES = new Set(["flowchart", "flowchart-v2", "sequence", "class"]);

function isFlowchart(diagramType) {
  return diagramType === "flowchart" || diagramType === "flowchart-v2";
}

const MAX_DETAIL_CHARS = 400;

export async function diagnoseMermaid(source, { maxNodes = 0 } = {}) {
  const mermaid = String(source ?? "");
  const nodeCount = countFlowchartNodes(mermaid);

  if (!mermaid.trim()) {
    return diagnosis({ errorType: mermaidErrorTypes.emptyDiagram, nodeCount: 0 });
  }

  const parsed = await parseMermaidWithError(mermaid);

  if (!parsed.ok) {
    return diagnosis({
      errorType: classifyParseError(mermaid, parsed.error),
      detail: parseErrorDetail(parsed.error),
      nodeCount,
    });
  }

  if (!IMPORTABLE_DIAGRAM_TYPES.has(parsed.diagramType)) {
    return diagnosis({
      errorType: mermaidErrorTypes.unsupportedDiagramType,
      detail: `Excalidraw cannot import diagram type "${parsed.diagramType}".`,
      diagramType: parsed.diagramType,
      nodeCount,
    });
  }

  // Mermaid accepts a bare `flowchart TD` header. The sanitizer produces exactly
  // that from prose-only or fence-only model output, so without this check an
  // empty diagram would pass validation and be streamed as a success.
  if (isFlowchart(parsed.diagramType) && nodeCount === 0) {
    return diagnosis({
      errorType: mermaidErrorTypes.emptyDiagram,
      detail: "The diagram has a header but no nodes or edges.",
      diagramType: parsed.diagramType,
      nodeCount,
    });
  }

  if (maxNodes > 0 && nodeCount > maxNodes) {
    return diagnosis({
      errorType: mermaidErrorTypes.nodeLimitExceeded,
      detail: `The diagram has ${nodeCount} nodes, the limit is ${maxNodes}.`,
      diagramType: parsed.diagramType,
      nodeCount,
    });
  }

  return {
    ok: true,
    errorType: "",
    severity: "",
    detail: "",
    diagramType: parsed.diagramType,
    nodeCount,
  };
}

// Classifies a model or upstream failure so the same vocabulary covers both
// "the diagram is broken" and "the call to fix it did not come back".
export function classifyUpstreamError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const name = error instanceof Error ? error.name : "";

  if (/timeout|timed out|ETIMEDOUT|aborted/i.test(`${name} ${message}`)) {
    return mermaidErrorTypes.upstreamTimeout;
  }

  return mermaidErrorTypes.upstreamError;
}

// Ranks a diagnosis so a repair pass can keep the best candidate it has seen:
// valid beats importable-but-flawed beats broken.
export function diagnosisRank(candidate) {
  if (candidate?.ok) {
    return 2;
  }
  return candidate?.severity === "soft" ? 1 : 0;
}

const RESERVED_END_AS_NODE =
  /(?:-{2,}>|-{2,}|={2,}>|-\.->|~{3})\s*(?:\|[^|]*\|\s*)?end\b|^\s*end\s*(?:-{2,}>|={2,}>|-\.->)/m;

export function countFlowchartNodes(source) {
  const mermaid = String(source ?? "");

  if (!/^\s*(flowchart|graph)\b/i.test(mermaid)) {
    return 0;
  }

  const ids = new Set();

  for (const line of mermaid.split("\n")) {
    if (SKIPPED_NODE_LINE.test(line)) {
      continue;
    }

    const stripped = line
      .replace(/"[^"]*"/g, " ")
      .replace(/\|[^|]*\|/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/-{2,}>|<-{2,}|-{2,}[ox]|={2,}>|-\.-+>|~{3}|-{2,}/g, " ");

    for (const token of stripped.match(/[A-Za-z0-9_][A-Za-z0-9_.-]*/g) || []) {
      if (!FLOWCHART_KEYWORDS.has(token.toLowerCase())) {
        ids.add(token);
      }
    }
  }

  return ids.size;
}

const SKIPPED_NODE_LINE =
  /^\s*(flowchart|graph|subgraph|end|direction|style|classDef|class|click|linkStyle|%%)/i;

const FLOWCHART_KEYWORDS = new Set([
  "flowchart",
  "graph",
  "subgraph",
  "end",
  "direction",
  "td",
  "tb",
  "bt",
  "lr",
  "rl",
]);

function classifyParseError(mermaid, error) {
  if (error?.name === "UnknownDiagramError") {
    return mermaidErrorTypes.unknownDiagramType;
  }

  if (RESERVED_END_AS_NODE.test(mermaid)) {
    return mermaidErrorTypes.reservedNodeId;
  }

  if (subgraphBalance(mermaid) !== 0) {
    return mermaidErrorTypes.unbalancedSubgraph;
  }

  const hash = error?.hash;
  const expected = Array.isArray(hash?.expected) ? hash.expected : [];

  if (hash?.token === "NODE_STRING" && expected.includes("'LINK'")) {
    return mermaidErrorTypes.invalidNodeId;
  }

  if (expected.includes("'SQE'") || expected.includes("'DIAMOND_STOP'")) {
    return mermaidErrorTypes.unquotedLabel;
  }

  return mermaidErrorTypes.syntaxError;
}

function subgraphBalance(mermaid) {
  let balance = 0;

  for (const line of mermaid.split("\n")) {
    if (/^\s*subgraph\b/i.test(line)) {
      balance += 1;
    } else if (/^\s*end\s*$/i.test(line)) {
      balance -= 1;
    }
  }

  return balance;
}

// The raw parser message embeds the offending diagram source, so it is only
// ever fed back to the model, never logged.
function parseErrorDetail(error) {
  if (error?.name === "UnknownDiagramError") {
    return "Mermaid could not detect a diagram type from the first line.";
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.slice(0, MAX_DETAIL_CHARS);
}

function diagnosis({ errorType, detail = "", diagramType = "", nodeCount = 0 }) {
  return {
    ok: false,
    errorType,
    severity: mermaidErrorSeverity[errorType] || "hard",
    detail,
    diagramType,
    nodeCount,
  };
}
