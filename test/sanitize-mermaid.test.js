import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isValidMermaid,
  sanitizeMermaid,
  sanitizeMermaidWithReport,
} from "../lib/mermaid-sanitize.js";

const cases = [
  {
    name: "removes leaked raw CSS class styling",
    fixture: "leaked-class-style.mmd",
    repairPattern: "stripped_invalid_class_line",
    expected: [
      "flowchart TD",
      "  A[User prompt] --> LEGEND[Legend]",
    ].join("\n"),
  },
  {
    name: "removes classDef styling lines",
    fixture: "leaked-classdef-style.mmd",
    repairPattern: "stripped_classdef_line",
    expected: [
      "flowchart TD",
      "  A[Start] --> B[Done]",
    ].join("\n"),
  },
  {
    name: "removes style fill lines",
    fixture: "leaked-style-fill.mmd",
    repairPattern: "stripped_style_line",
    expected: [
      "flowchart TD",
      "  A[Start] --> B[Done]",
    ].join("\n"),
  },
  {
    name: "removes prose and markdown fences",
    fixture: "prose-and-fences.mmd",
    repairPattern: "stripped_prose_and_fences",
    expected: [
      "flowchart TD",
      "  A[Start] --> B[Done]",
    ].join("\n"),
  },
  {
    name: "normalizes loose edge labels",
    fixture: "loose-edge-label.mmd",
    repairPattern: "normalized_loose_edge_label",
    expected: [
      "flowchart TD",
      "  A -->|success| B",
    ].join("\n"),
  },
  {
    name: "quotes flowchart labels with Mermaid-significant punctuation",
    fixture: "punctuation-labels.mmd",
    repairPattern: "quoted_punctuation_labels",
    expected: [
      "flowchart TD",
      "  A[\"Build (npm)\"] -->|\"reads/writes\"| B[\"API: server\"]",
    ].join("\n"),
  },
  {
    name: "adds a default flowchart header",
    fixture: "missing-flowchart-header.mmd",
    repairPattern: "added_default_flowchart",
    expected: [
      "flowchart TD",
      "A[Start] --> B[Done]",
    ].join("\n"),
  },
];

for (const testCase of cases) {
  test(`sanitizeMermaid ${testCase.name}`, async () => {
    const raw = await readFixture(testCase.fixture);
    const report = sanitizeMermaidWithReport(raw);

    assert.equal(sanitizeMermaid(raw), testCase.expected);
    assert.equal(report.mermaid, testCase.expected);
    assert.equal(report.repairApplied, true);
    assert.ok(report.repairReasons.includes(testCase.repairPattern));
  });
}

test("isValidMermaid uses Mermaid syntax parsing", async () => {
  assert.equal(await isValidMermaid("flowchart TD\n  A --> B"), true);
  assert.equal(await isValidMermaid("flowchart TD\n  A -->|unterminated B"), false);
});

function readFixture(name) {
  return readFile(`test/fixtures/mermaid/${name}`, "utf8");
}
