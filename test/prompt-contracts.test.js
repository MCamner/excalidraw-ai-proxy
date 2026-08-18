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
  assert.doesNotMatch(prompt, /at most 25 nodes/i);
});

// Routing matrix. Architecture mode imposes materially different structural
// constraints (mandatory subgraphs and fully quoted labels), so a false positive
// still narrows what the user asked for. Diagram size is enforced separately by
// the runtime MERMAID_MAX_NODES policy.
const routingCases = [
  // Strong signals: architecture on their own.
  { prompt: "visa arkitekturen", expected: "architecture" },
  { prompt: "rita ett dataflöde mellan mikrotjänster", expected: "architecture" },
  { prompt: "create a component diagram", expected: "architecture" },
  { prompt: "show the C4 context view", expected: "architecture" },
  { prompt: "describe our infrastructure", expected: "architecture" },
  { prompt: "systemdesign för betalningar", expected: "architecture" },

  // Weak signals promoted by architecture context.
  { prompt: "show the system components", expected: "architecture" },
  { prompt: "data flow between the backend services", expected: "architecture" },
  { prompt: "deployment of the microservices", expected: "architecture" },

  // Weak signals without context: must stay on the default contract.
  { prompt: "show the components of a form", expected: "default" },
  { prompt: "lägg till en komponent i formuläret", expected: "default" },
  { prompt: "deployment steps for the release", expected: "default" },

  // No signal at all.
  { prompt: "a login flow", expected: "default" },
  { prompt: "rita ett flödesschema för inloggning", expected: "default" },
  { prompt: "", expected: "default" },
];

for (const routingCase of routingCases) {
  test(`systemPromptFor routes ${JSON.stringify(routingCase.prompt)} to the ${routingCase.expected} contract`, () => {
    assert.equal(
      systemPromptFor(routingCase.prompt),
      promptContracts[routingCase.expected],
    );
  });
}

test("an explicit mode overrides the heuristic in both directions", () => {
  assert.equal(
    systemPromptFor("a login flow", { mode: "architecture" }),
    promptContracts.architecture,
  );
  assert.equal(
    systemPromptFor("visa arkitekturen", { mode: "default" }),
    promptContracts.default,
  );
});

test("an unknown or absent mode falls back to the heuristic", () => {
  assert.equal(systemPromptFor("visa arkitekturen", {}), promptContracts.architecture);
  assert.equal(
    systemPromptFor("visa arkitekturen", { mode: "nonsense" }),
    promptContracts.architecture,
  );
  assert.equal(systemPromptFor("a login flow", { mode: null }), promptContracts.default);
  assert.equal(systemPromptFor("a login flow", { mode: 42 }), promptContracts.default);
});

test("mode matching ignores case and surrounding whitespace", () => {
  assert.equal(
    systemPromptFor("a login flow", { mode: "  Architecture " }),
    promptContracts.architecture,
  );
});
