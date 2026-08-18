import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyUpstreamError,
  compareDiagnoses,
  countFlowchartNodes,
  diagnoseMermaid,
  diagnosisRank,
  mermaidErrorTypes,
} from "../lib/mermaid-diagnostics.js";
import { sanitizeMermaid } from "../lib/mermaid-sanitize.js";

const cases = [
  {
    name: "flags an unclosed subgraph",
    fixture: "unbalanced-subgraph.mmd",
    errorType: mermaidErrorTypes.unbalancedSubgraph,
    severity: "hard",
  },
  {
    name: "flags end used as a node ID",
    fixture: "reserved-end-node-id.mmd",
    errorType: mermaidErrorTypes.reservedNodeId,
    severity: "hard",
  },
  {
    name: "flags a node ID containing a space",
    fixture: "spaced-node-id.mmd",
    errorType: mermaidErrorTypes.invalidNodeId,
    severity: "hard",
  },
  {
    name: "flags an unquoted label with punctuation",
    fixture: "unquoted-label.mmd",
    errorType: mermaidErrorTypes.unquotedLabel,
    severity: "hard",
  },
  {
    name: "flags a diagram type Excalidraw cannot import",
    fixture: "unsupported-er-diagram.mmd",
    errorType: mermaidErrorTypes.unsupportedDiagramType,
    severity: "soft",
  },
];

for (const testCase of cases) {
  test(`diagnoseMermaid ${testCase.name}`, async () => {
    const source = await readFixture(testCase.fixture);
    const result = await diagnoseMermaid(source);

    assert.equal(result.ok, false);
    assert.equal(result.errorType, testCase.errorType);
    assert.equal(result.severity, testCase.severity);
  });
}

test("diagnoseMermaid accepts an importable flowchart", async () => {
  const result = await diagnoseMermaid("flowchart TD\n  A[Start] --> B[Done]");

  assert.equal(result.ok, true);
  assert.equal(result.errorType, "");
  assert.equal(result.diagramType, "flowchart-v2");
  assert.equal(result.nodeCount, 2);
});

test("diagnoseMermaid flags empty output", async () => {
  const result = await diagnoseMermaid("   ");

  assert.equal(result.errorType, mermaidErrorTypes.emptyDiagram);
  assert.equal(result.severity, "hard");
});

// Mermaid parses a bare header, so without this the sanitizer's default header
// would turn prose-only model output into a "valid" empty diagram.
test("diagnoseMermaid flags a header without nodes", async () => {
  const result = await diagnoseMermaid("flowchart TD");

  assert.equal(result.errorType, mermaidErrorTypes.emptyDiagram);
  assert.equal(result.severity, "hard");
});

test("diagnoseMermaid flags sanitized prose-only output as empty", async () => {
  const sanitized = sanitizeMermaid(await readFixture("prose-only.mmd"));
  const result = await diagnoseMermaid(sanitized);

  assert.equal(result.errorType, mermaidErrorTypes.emptyDiagram);
});

test("diagnoseMermaid accepts a single-node flowchart", async () => {
  const result = await diagnoseMermaid("flowchart TD\n  A[Only node]");

  assert.equal(result.ok, true);
  assert.equal(result.nodeCount, 1);
});

test("diagnoseMermaid flags a missing diagram header", async () => {
  const result = await diagnoseMermaid("A --> B");

  assert.equal(result.errorType, mermaidErrorTypes.unknownDiagramType);
  assert.equal(result.severity, "hard");
});

test("diagnoseMermaid flags a diagram above the node limit", async () => {
  const result = await diagnoseMermaid(buildFlowchart(6), { maxNodes: 4 });

  assert.equal(result.errorType, mermaidErrorTypes.nodeLimitExceeded);
  assert.equal(result.severity, "soft");
  assert.equal(result.nodeCount, 6);
  assert.match(result.detail, /6 nodes/);
});

test("diagnoseMermaid leaves the node limit off when it is zero", async () => {
  const result = await diagnoseMermaid(buildFlowchart(6), { maxNodes: 0 });

  assert.equal(result.ok, true);
});

test("diagnoseMermaid keeps diagram source out of the unknown-type detail", async () => {
  const result = await diagnoseMermaid("secret prompt leak candidate");

  assert.equal(result.detail.includes("secret prompt leak candidate"), false);
});

test("countFlowchartNodes ignores labels, edge labels, and structure lines", () => {
  const source = [
    "flowchart TD",
    "  subgraph S1[\"Group with words\"]",
    "    A[\"Start (fast)\"] -->|\"reads/writes\"| B[\"Done\"]",
    "  end",
    "  B --> C{\"Valid?\"}",
  ].join("\n");

  assert.equal(countFlowchartNodes(source), 3);
});

test("countFlowchartNodes only counts flowcharts", () => {
  assert.equal(countFlowchartNodes("sequenceDiagram\n  A->>B: hi"), 0);
});

test("classifyUpstreamError separates timeouts from other upstream failures", () => {
  const timeout = new Error("Request timed out.");
  timeout.name = "APIConnectionTimeoutError";

  assert.equal(classifyUpstreamError(timeout), mermaidErrorTypes.upstreamTimeout);
  assert.equal(classifyUpstreamError(new Error("connection reset")), mermaidErrorTypes.upstreamError);
});

test("compareDiagnoses ranks a smaller over-budget diagram above a larger one", () => {
  const smaller = { ok: false, severity: "soft", errorType: mermaidErrorTypes.nodeLimitExceeded, nodeCount: 9 };
  const larger = { ok: false, severity: "soft", errorType: mermaidErrorTypes.nodeLimitExceeded, nodeCount: 15 };

  assert.ok(compareDiagnoses(smaller, larger) > 0);
  assert.ok(compareDiagnoses(larger, smaller) < 0);
  assert.equal(compareDiagnoses(smaller, smaller), 0);
  assert.ok(compareDiagnoses({ ok: true }, smaller) > 0);
});

test("diagnosisRank prefers valid over importable-but-flawed over broken", () => {
  assert.equal(diagnosisRank({ ok: true }), 2);
  assert.equal(diagnosisRank({ ok: false, severity: "soft" }), 1);
  assert.equal(diagnosisRank({ ok: false, severity: "hard" }), 0);
});

function buildFlowchart(nodeCount) {
  const lines = ["flowchart TD"];
  for (let index = 1; index < nodeCount; index += 1) {
    lines.push(`  N${index}["Node ${index}"] --> N${index + 1}["Node ${index + 1}"]`);
  }
  return lines.join("\n");
}

function readFixture(name) {
  return readFile(`test/fixtures/mermaid/${name}`, "utf8");
}
