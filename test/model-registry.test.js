import assert from "node:assert/strict";
import test from "node:test";

import {
  clampMaxOutput,
  modelCapabilities,
  parseModelPool,
  resolveModelRouting,
  selectModel,
  validateModelRouting,
} from "../lib/model-registry.js";

test("modelCapabilities returns the registered entry", () => {
  const capabilities = modelCapabilities("gpt-4.1-mini");

  assert.equal(capabilities.known, true);
  assert.equal(capabilities.provider, "openai");
  assert.equal(capabilities.supportsStreaming, true);
  assert.equal(capabilities.supportsImageInput, true);
  assert.equal(capabilities.maxOutput, 32_768);
  assert.equal(capabilities.diagramQualityTier, "standard");
  assert.equal(capabilities.costTier, "medium");
});

// A model released after this table was written must keep working.
test("modelCapabilities treats an unlisted model as capable but unknown", () => {
  const capabilities = modelCapabilities("some-future-model");

  assert.equal(capabilities.known, false);
  assert.equal(capabilities.supportsStreaming, true);
  assert.equal(capabilities.maxOutput, 0);
  assert.equal(capabilities.diagramQualityTier, "unknown");
});

test("selectModel prefers an explicitly configured model over the pool", () => {
  const selection = selectModel("text-to-diagram", {
    textToDiagramModel: "gpt-4o",
    modelPool: ["gpt-4.1-nano"],
    defaultModel: "gpt-4.1-mini",
  });

  assert.deepEqual(selection, {
    model: "gpt-4o",
    task: "text-to-diagram",
    reason: "configured",
  });
});

test("selectModel picks the cheapest qualifying model for an ordinary flowchart", () => {
  const selection = selectModel("text-to-diagram", {
    modelPool: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"],
    defaultModel: "gpt-4o",
  });

  assert.equal(selection.model, "gpt-4.1-nano");
  assert.equal(selection.reason, "pool");
});

test("selectModel picks the strongest qualifying model for architecture", () => {
  const selection = selectModel("text-to-diagram:architecture", {
    modelPool: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"],
    defaultModel: "gpt-4o",
  });

  assert.equal(selection.model, "gpt-4.1");
  assert.equal(selection.reason, "pool");
});

test("selectModel keeps the repair pass on a small model", () => {
  const selection = selectModel("mermaid-repair", {
    modelPool: ["gpt-4.1", "gpt-4.1-nano"],
    textToDiagramModel: "gpt-4.1",
  });

  assert.equal(selection.model, "gpt-4.1-nano");
});

test("selectModel requires image input for diagram-to-code", () => {
  const streamingOnly = selectModel("diagram-to-code", {
    modelPool: ["text-only-model"],
    defaultModel: "gpt-4o",
  });

  // The unlisted model is not poolable, so the configured default is used.
  assert.equal(streamingOnly.model, "gpt-4o");
  assert.equal(streamingOnly.reason, "fallback");
});

test("selectModel falls back through the task chain", () => {
  const config = { textToDiagramModel: "gpt-4.1-mini", defaultModel: "gpt-4o" };

  assert.equal(selectModel("text-to-diagram:architecture", config).model, "gpt-4.1-mini");
  assert.equal(selectModel("mermaid-repair", config).model, "gpt-4.1-mini");
  assert.equal(selectModel("diagram-to-code", config).model, "gpt-4o");
});

test("selectModel reports an unresolved task instead of inventing a model", () => {
  assert.deepEqual(selectModel("text-to-diagram", {}), {
    model: "",
    task: "text-to-diagram",
    reason: "unresolved",
  });
});

test("selectModel ignores a pool with no qualifying model", () => {
  const selection = selectModel("text-to-diagram:architecture", {
    modelPool: ["gpt-4.1-nano"],
    defaultModel: "gpt-4o",
  });

  // nano is below the architecture quality floor, so the fallback wins.
  assert.equal(selection.model, "gpt-4o");
  assert.equal(selection.reason, "fallback");
});

test("clampMaxOutput respects a known model's documented limit", () => {
  assert.equal(clampMaxOutput("gpt-4o-mini", 32_000), 16_384);
  assert.equal(clampMaxOutput("gpt-4o-mini", 1_600), 1_600);
});

test("clampMaxOutput leaves unknown models alone", () => {
  assert.equal(clampMaxOutput("some-future-model", 99_000), 99_000);
});

// The missing-capability branch guards future registry rows. Every model in the
// table today supports every flag, so an unlisted model is the only case that
// can reach validation, and it is deliberately not flagged.
test("validateModelRouting stays quiet for an unlisted model", () => {
  const problems = validateModelRouting({
    defaultModel: "gpt-4.1-mini",
    diagramToCodeModel: "text-only-model",
  });

  assert.deepEqual(problems, []);
});

test("validateModelRouting reports a task with no model at all", () => {
  const problems = validateModelRouting({});

  assert.equal(problems.length, 4);
  assert.equal(problems.every((problem) => problem.problem === "no_model_resolved"), true);
});

test("resolveModelRouting covers every task", () => {
  const routing = resolveModelRouting({ defaultModel: "gpt-4.1-mini" });

  assert.deepEqual(Object.keys(routing), [
    "text-to-diagram",
    "text-to-diagram:architecture",
    "mermaid-repair",
    "diagram-to-code",
  ]);
});

test("parseModelPool trims and drops empty entries", () => {
  assert.deepEqual(parseModelPool(" gpt-4.1-nano , gpt-4.1 ,, "), ["gpt-4.1-nano", "gpt-4.1"]);
  assert.deepEqual(parseModelPool(undefined), []);
});
