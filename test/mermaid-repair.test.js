import assert from "node:assert/strict";
import test from "node:test";

import { mermaidErrorTypes } from "../lib/mermaid-diagnostics.js";
import { buildRepairPrompt, repairAttemptLimit, repairMermaid } from "../lib/mermaid-repair.js";

const config = {
  textToDiagramModel: "test-text-model",
  textToDiagramMaxTokens: 1600,
  mermaidAutoRepair: true,
  mermaidMaxRepairAttempts: 2,
  mermaidMaxNodes: 0,
};

const validFlowchart = "flowchart TD\n  A[Start] --> B[Done]";

test("repairMermaid skips the model when sanitizing is enough", async () => {
  const openai = createFakeOpenAI([]);

  const report = await repairMermaid("```mermaid\n" + validFlowchart + "\n```", { openai, config });

  assert.equal(openai.calls.length, 0);
  assert.equal(report.mermaid, validFlowchart);
  assert.equal(report.errorType, "");
  assert.deepEqual(report.repairAttempts, []);
  assert.equal(report.repairReasons.includes("stripped_prose_and_fences"), true);
});

test("repairMermaid sends the classified error into the repair prompt", async () => {
  const openai = createFakeOpenAI([validFlowchart]);

  const report = await repairMermaid("flowchart TD\n  subgraph S1[Group]\n    A --> B", {
    openai,
    config,
  });

  assert.equal(openai.calls.length, 1);
  assert.match(userMessageOf(openai.calls[0]), /Error type: unbalanced_subgraph/);
  assert.match(userMessageOf(openai.calls[0]), /closed by exactly one end line/);
  assert.equal(report.mermaid, validFlowchart);
  assert.equal(report.errorType, "");
  assert.deepEqual(report.repairAttempts, [
    { attempt: 1, errorType: mermaidErrorTypes.unbalancedSubgraph, outcome: "resolved" },
  ]);
  assert.equal(report.repairReasons.includes("openai_auto_repair"), true);
});

test("repairMermaid reclassifies between attempts and stops at the limit", async () => {
  const openai = createFakeOpenAI([
    "flowchart TD\n  my node[Label] --> B[Done]",
    "flowchart TD\n  still broken [",
  ]);

  const report = await repairMermaid("flowchart TD\n  subgraph S1[Group]\n    A --> B", {
    openai,
    config,
  });

  assert.equal(openai.calls.length, 2);
  assert.match(userMessageOf(openai.calls[1]), /Error type: invalid_node_id/);
  assert.deepEqual(report.repairAttempts.map((attempt) => attempt.outcome), [
    "unresolved",
    "unresolved",
  ]);
  assert.equal(report.severity, "hard");
});

test("repairMermaid honours a single-attempt limit", async () => {
  const openai = createFakeOpenAI(["still invalid", "flowchart TD\n  A --> B"]);

  const report = await repairMermaid("not mermaid", {
    openai,
    config: { ...config, mermaidMaxRepairAttempts: 1 },
  });

  assert.equal(openai.calls.length, 1);
  assert.equal(report.severity, "hard");
});

test("repairMermaid keeps the best candidate when a retry comes back worse", async () => {
  const openai = createFakeOpenAI(["erDiagram\n  CUSTOMER ||--o{ ORDER : places", "not mermaid"]);

  const report = await repairMermaid("flowchart TD\n  A[Start (fast)] --> end[Done]", {
    openai,
    config,
  });

  assert.equal(report.severity, "soft");
  assert.equal(report.errorType, mermaidErrorTypes.unsupportedDiagramType);
  assert.match(report.mermaid, /erDiagram/);
});

test("repairMermaid retries an importable diagram that is over the node limit", async () => {
  const openai = createFakeOpenAI([validFlowchart]);

  const report = await repairMermaid(buildFlowchart(6), {
    openai,
    config: { ...config, mermaidMaxNodes: 4 },
  });

  assert.match(userMessageOf(openai.calls[0]), /Error type: node_limit_exceeded/);
  assert.equal(report.errorType, "");
  assert.equal(report.nodeCount, 2);
});

test("repairMermaid records an upstream timeout and keeps what it has", async () => {
  const timeout = new Error("Request timed out.");
  timeout.name = "APIConnectionTimeoutError";
  const openai = createFakeOpenAI([timeout]);

  const report = await repairMermaid("flowchart TD\n  A[Start (fast)] --> end[Done]", {
    openai,
    config,
  });

  assert.deepEqual(report.repairAttempts, [
    {
      attempt: 1,
      errorType: mermaidErrorTypes.reservedNodeId,
      outcome: mermaidErrorTypes.upstreamTimeout,
    },
  ]);
  assert.equal(report.severity, "hard");
});

test("repairMermaid leaves the model alone when auto repair is off", async () => {
  const openai = createFakeOpenAI([validFlowchart]);

  const report = await repairMermaid("not mermaid", {
    openai,
    config: { ...config, mermaidAutoRepair: false },
  });

  assert.equal(openai.calls.length, 0);
  // The sanitizer still adds the default header, so what is left is the prose
  // masquerading as a node ID.
  assert.equal(report.errorType, mermaidErrorTypes.invalidNodeId);
});

test("repairAttemptLimit clamps configuration to the hard cap", () => {
  assert.equal(repairAttemptLimit({}), 1);
  assert.equal(repairAttemptLimit({ mermaidMaxRepairAttempts: 0 }), 0);
  assert.equal(repairAttemptLimit({ mermaidMaxRepairAttempts: 9 }), 2);
  assert.equal(repairAttemptLimit({ mermaidMaxRepairAttempts: -3 }), 0);
  assert.equal(repairAttemptLimit({ mermaidMaxRepairAttempts: "nope" }), 1);
});

test("repairMermaid gives the model the original request when the diagram is empty", async () => {
  const openai = createFakeOpenAI([validFlowchart]);

  const report = await repairMermaid("Here is a diagram: nice", {
    openai,
    config,
    prompt: "a login flow",
  });

  assert.match(userMessageOf(openai.calls[0]), /Error type: empty_diagram/);
  assert.match(userMessageOf(openai.calls[0]), /Original request:\na login flow/);
  assert.equal(report.mermaid, validFlowchart);
  assert.equal(report.errorType, "");
});

test("buildRepairPrompt only carries the request for an empty diagram", () => {
  const empty = buildRepairPrompt(
    { errorType: mermaidErrorTypes.emptyDiagram, detail: "" },
    "flowchart TD",
    { prompt: "a login flow" },
  );
  const other = buildRepairPrompt(
    { errorType: mermaidErrorTypes.syntaxError, detail: "" },
    validFlowchart,
    { prompt: "a login flow" },
  );

  assert.match(empty, /Original request:/);
  assert.doesNotMatch(other, /Original request:/);
});

test("buildRepairPrompt falls back to the generic instruction for unknown types", () => {
  const prompt = buildRepairPrompt({ errorType: "something_new", detail: "" }, validFlowchart);

  assert.match(prompt, /Error type: something_new/);
  assert.match(prompt, /Fix the syntax error/);
  assert.match(prompt, /flowchart TD/);
});

function buildFlowchart(nodeCount) {
  const lines = ["flowchart TD"];
  for (let index = 1; index < nodeCount; index += 1) {
    lines.push(`  N${index}["Node ${index}"] --> N${index + 1}["Node ${index + 1}"]`);
  }
  return lines.join("\n");
}

function userMessageOf(call) {
  return call.messages.find((message) => message.role === "user").content;
}

function createFakeOpenAI(replies) {
  const calls = [];
  let index = 0;

  return {
    calls,
    chat: {
      completions: {
        async create(params) {
          calls.push(params);
          const reply = replies[index];
          index += 1;

          if (reply instanceof Error) {
            throw reply;
          }

          return { choices: [{ message: { content: reply ?? "" } }] };
        },
      },
    },
  };
}
