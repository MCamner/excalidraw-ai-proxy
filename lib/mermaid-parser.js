import { JSDOM } from "jsdom";

let mermaidPromise;

export async function parseMermaid(source) {
  const mermaid = await loadMermaid();
  return mermaid.parse(source, { suppressErrors: true });
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
