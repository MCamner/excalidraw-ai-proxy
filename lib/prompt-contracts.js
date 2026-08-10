// Base instructions for a single Mermaid diagram from a free-text request.
const DEFAULT_SYSTEM_PROMPT =
  "You generate valid Mermaid source for Excalidraw's Mermaid parser. Return only Mermaid code, no markdown fences, no explanation. Prefer flowchart TD unless the user explicitly asks for a sequence diagram. Use simple ASCII node IDs like A, B, C. Use node labels like A[Start] and decisions like C{Valid?}. Always wrap any node or edge label containing parentheses, slashes, ampersands, colons, or other punctuation in double quotes, for example B[\"Build (npm)\"] and C -->|\"Yes (200)\"| D. Use edge labels only in pipe form, for example C -->|Yes| D. Never use JSON, HTML, Excalidraw element objects, or prose.";

// Richer instructions for architecture/system requests: group with subgraphs,
// label the flow, and cap the size so the result stays importable.
const ARCHITECTURE_SYSTEM_PROMPT =
  "You generate valid Mermaid source for Excalidraw's Mermaid parser describing a software architecture. Return only Mermaid code, no markdown fences, no explanation. Use flowchart TD. Group related components with subgraph blocks that have descriptive titles. Show data and control flow with labeled edges. Use simple ASCII node IDs like A, B, S1, DB1. Always wrap every node label, subgraph title, and edge label in double quotes, for example S1[\"API Gateway\"], subgraph SVC[\"Services\"], and A -->|\"reads/writes\"| DB1. Do not use classDef, style lines, bare class statements with raw CSS such as class LEGEND fill:#fff, HTML, JSON, or prose. Do not use reserved words such as end as node IDs. Keep it to at most 25 nodes.";

// The architecture contract is materially stricter than the default one: it
// mandates subgraphs and caps the diagram at 25 nodes. Selecting it by mistake
// silently narrows what the user asked for, so the heuristic is deliberately
// two-tier. Both tiers are bilingual (sv/en) and match on stems so Swedish
// compounds and inflections are covered.

// Terms that only appear in architecture requests. These select the contract
// on their own.
const STRONG_ARCHITECTURE_SIGNAL =
  /\b(arkitektur|architectur|infrastruktur|infrastructur|mikrotjänst|microservice|c4\b|system\s?design|systemdesign|topolog|component\s+diagram|komponentdiagram)/i;

// Terms that are common in ordinary diagram requests too ("the components of a
// form", "deployment steps"). These only select the contract when architecture
// context is also present.
const WEAK_ARCHITECTURE_SIGNAL =
  /\b(komponent|component|dataflöd|data\s?flow|dataflow|deployment|deploy\b)/i;

// Context that promotes a weak signal to an architecture request.
const ARCHITECTURE_CONTEXT =
  /\b(system|backend|frontend|microservice|mikrotjänst|infrastruktur|infrastructure|api\b|databas|database|server|modul|module|service)/i;

const CONTRACT_MODES = new Set(["default", "architecture"]);

export function systemPromptFor(prompt, { mode } = {}) {
  const explicitMode = normalizeMode(mode);
  if (explicitMode) {
    return promptContracts[explicitMode];
  }

  return isArchitecturePrompt(prompt) ? ARCHITECTURE_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT;
}

export function isArchitecturePrompt(prompt) {
  const text = String(prompt || "");

  if (STRONG_ARCHITECTURE_SIGNAL.test(text)) {
    return true;
  }

  return WEAK_ARCHITECTURE_SIGNAL.test(text) && ARCHITECTURE_CONTEXT.test(text);
}

// Unknown values fall back to the heuristic rather than failing the request:
// Excalidraw does not send `mode`, and a future client sending an unrecognized
// value should still get a diagram.
export function normalizeMode(mode) {
  if (typeof mode !== "string") {
    return "";
  }

  const normalized = mode.trim().toLowerCase();
  return CONTRACT_MODES.has(normalized) ? normalized : "";
}

export const promptContracts = {
  default: DEFAULT_SYSTEM_PROMPT,
  architecture: ARCHITECTURE_SYSTEM_PROMPT,
};

export const promptContractModes = [...CONTRACT_MODES];
