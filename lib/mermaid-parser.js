import { JSDOM } from "jsdom";

let mermaidPromise;

export async function parseMermaid(source) {
  const mermaid = await loadMermaid();
  return mermaid.parse(source, { suppressErrors: true });
}

// Same parse, but keeps the thrown parser error instead of swallowing it. The
// error carries the failing line and the expected tokens, which is what the
// diagnostics layer classifies and what a targeted repair prompt needs.
export async function parseMermaidWithError(source) {
  const mermaid = await loadMermaid();

  try {
    const result = await mermaid.parse(source);
    return { ok: true, diagramType: result?.diagramType || "", error: null };
  } catch (error) {
    return { ok: false, diagramType: "", error };
  }
}

function loadMermaid() {
  mermaidPromise ??= importMermaidWithDom();
  return mermaidPromise;
}

async function importMermaidWithDom() {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const dom = new JSDOM("");

  try {
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const { default: mermaid } = await import("mermaid");
    return mermaid;
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("document", previousDocument);
    dom.window.close();
  }
}

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
    return;
  }
  globalThis[name] = value;
}
