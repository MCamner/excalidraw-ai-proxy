import assert from "node:assert/strict";
import test from "node:test";

import { promptContracts, systemPromptFor } from "../lib/prompt-contracts.js";

test("systemPromptFor returns the default Mermaid contract for ordinary prompts", () => {
  const prompt = systemPromptFor("create a login flow");

  assert.equal(prompt, promptContracts.default);
  assert.match(prompt, /Return only Mermaid code/);
  assert.match(prompt, /Never use JSON, HTML/);
});

test("systemPromptFor returns the architecture contract for system prompts", () => {
  const prompt = systemPromptFor("rita arkitektur for min proxy");

  assert.equal(prompt, promptContracts.architecture);
  assert.match(prompt, /Group related components with subgraph blocks/);
  assert.match(prompt, /Do not use classDef/);
});
