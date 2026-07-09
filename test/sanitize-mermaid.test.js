import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.OPENAI_API_KEY = "test-key";

const { sanitizeMermaid } = await import("../server.js");

test("sanitizeMermaid removes leaked raw CSS class styling", async () => {
  const raw = await readFile("test/fixtures/mermaid/leaked-class-style.mmd", "utf8");

  assert.equal(
    sanitizeMermaid(raw),
    [
      "flowchart TD",
      "  A[User prompt] --> LEGEND[Legend]",
    ].join("\n"),
  );
});
