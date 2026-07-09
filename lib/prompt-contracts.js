// Base instructions for a single Mermaid diagram from a free-text request.
const DEFAULT_SYSTEM_PROMPT =
  "You generate valid Mermaid source for Excalidraw's Mermaid parser. Return only Mermaid code, no markdown fences, no explanation. Prefer flowchart TD unless the user explicitly asks for a sequence diagram. Use simple ASCII node IDs like A, B, C. Use node labels like A[Start] and decisions like C{Valid?}. Always wrap any node or edge label containing parentheses, slashes, ampersands, colons, or other punctuation in double quotes, for example B[\"Build (npm)\"] and C -->|\"Yes (200)\"| D. Use edge labels only in pipe form, for example C -->|Yes| D. Never use JSON, HTML, Excalidraw element objects, or prose.";

// Richer instructions for architecture/system requests: group with subgraphs,
// label the flow, and cap the size so the result stays importable.
const ARCHITECTURE_SYSTEM_PROMPT =
  "You generate valid Mermaid source for Excalidraw's Mermaid parser describing a software architecture. Return only Mermaid code, no markdown fences, no explanation. Use flowchart TD. Group related components with subgraph blocks that have descriptive titles. Show data and control flow with labeled edges. Use simple ASCII node IDs like A, B, S1, DB1. Always wrap every node label, subgraph title, and edge label in double quotes, for example S1[\"API Gateway\"], subgraph SVC[\"Services\"], and A -->|\"reads/writes\"| DB1. Do not use classDef, style lines, bare class statements with raw CSS such as class LEGEND fill:#fff, HTML, JSON, or prose. Do not use reserved words such as end as node IDs. Keep it to at most 25 nodes.";

const ARCHITECTURE_HINT =
  /\b(arkitektur|architecture|c4|komponent|components?|system\s?design|dataflöd|data\s?flow|microservice|mikrotjänst|infrastruktur|infrastructure|topolog|deployment)/i;

export function systemPromptFor(prompt) {
  return ARCHITECTURE_HINT.test(prompt || "")
    ? ARCHITECTURE_SYSTEM_PROMPT
    : DEFAULT_SYSTEM_PROMPT;
}

export const promptContracts = {
  default: DEFAULT_SYSTEM_PROMPT,
  architecture: ARCHITECTURE_SYSTEM_PROMPT,
};
