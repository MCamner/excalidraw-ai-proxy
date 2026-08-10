---
name: mermaid-repair
description: "Add or change a deterministic Mermaid repair pattern in this proxy — when a model returns Mermaid that Excalidraw cannot import, or an existing repair strips too much or too little. Keeps the fixture, the sanitizer rule, the regression test, and the AI output contract in sync. Triggers on: Excalidraw import fails, broken Mermaid, sanitizer rule, repair pattern, repairReasons, stripped_*, normalized_*, quoted_*, added_default_flowchart, mermaid-sanitize.js."
---

# Adding a Mermaid repair pattern

Every deterministic repair in this proxy lives in **four places**. A change that
touches fewer than four leaves the repo inconsistent — most often the contract
doc drifts from the code, and the next contributor cannot tell which patterns
are real.

| # | File | What goes there |
| --- | --- | --- |
| 1 | `test/fixtures/mermaid/<pattern>.mmd` | The exact broken input, minimal |
| 2 | `test/sanitize-mermaid.test.js` | A case in the `cases` array |
| 3 | `lib/mermaid-sanitize.js` | The rule and its `repairReason` |
| 4 | `docs/AI_CONTRACT.md` | One line under "Current repaired patterns" |

`docs/AI_CONTRACT.md` states "Every repaired pattern should have a regression
test." Nothing enforces it. This skill is the enforcement.

## Workflow

Work in this order. The test must fail before the rule exists, or you have not
proven the fixture reproduces the bug.

### 1. Reproduce

Get the real broken Mermaid — from a bug report, a proxy log, or a live run.
Reduce it to the smallest input that still fails. Two or three lines is normal;
existing fixtures are 23–97 bytes.

Confirm it actually fails the way you think:

```bash
node -e "import('./lib/mermaid-sanitize.js').then(async m => {
  const src = await import('node:fs/promises').then(fs => fs.readFile('test/fixtures/mermaid/<pattern>.mmd', 'utf8'));
  console.log(JSON.stringify(m.sanitizeMermaidWithReport(src), null, 2));
  console.log('valid:', await m.isValidMermaid(m.sanitizeMermaid(src)));
})"
```

`isValidMermaid` runs the real Mermaid parser via jsdom (`lib/mermaid-parser.js`).
If it already returns `true`, Excalidraw can import it and there may be no bug —
check whether the complaint is about *structure loss* instead.

### 2. Name the pattern

`repairReason` strings are a public-ish contract: they appear in
`/v1/ai/text-to-diagram/chat-streaming` responses and in the structured request
log in `server.js`. Follow the existing verb prefixes:

- `stripped_*` — a line is removed entirely
- `normalized_*` — syntax is rewritten, meaning preserved
- `quoted_*` — label text is escaped
- `added_*` — something missing is inserted

Reuse an existing reason if the repair is genuinely the same class of fix.
`addRepairReason` deduplicates, so several code paths can share one reason —
`stripped_prose_and_fences` is already set from three places.

### 3. Fixture and failing test

Write the fixture, then add the case to the `cases` array in
`test/sanitize-mermaid.test.js`:

```js
{
  name: "<what the repair does, present tense>",
  fixture: "<pattern>.mmd",
  repairPattern: "<repair_reason>",
  expected: [
    "flowchart TD",
    "  A[Start] --> B[Done]",
  ].join("\n"),
},
```

`expected` is the exact sanitized output, no trailing newline. The shared runner
asserts `sanitizeMermaid`, `report.mermaid`, `repairApplied === true`, and that
`repairReasons` includes your pattern. Run it and watch it fail:

```bash
node --test test/sanitize-mermaid.test.js
```

### 4. The rule

Now edit `lib/mermaid-sanitize.js`. Placement in `sanitizeMermaidWithReport`
matters — the pipeline is ordered and each stage sees the previous stage's
output:

1. **Strip Markdown fences** — sets `stripped_prose_and_fences`
2. **Cut prose before the first diagram header** — same reason
3. **Per line:** trim trailing whitespace, normalize loose edge labels
   (`A -- label --> B` → `A -->|label| B`); drop blank lines and `Here's…` prose
4. **Add `flowchart TD`** if no diagram header matched
5. **Flowchart/graph only:** strip styling lines, then quote labels

Consequences to respect:

- **Stage 5 never runs for `sequenceDiagram`, `classDiagram`, or `erDiagram`.**
  A repair for those diagram types belongs in stage 3, or needs its own guarded
  block. Putting it in stage 5 makes it silently dead.
- **Label quoting runs last.** A styling or structural rule you add in stage 5
  sees raw, unquoted labels; a rule added after quoting sees `["Build (npm)"]`.
- **Stage 4 guarantees a header.** Anything after stage 4 can assume the first
  line is a diagram declaration.
- Prefer extending the module-level constants — `FLOWCHART_STYLING_LINE`,
  `LABEL_NEEDS_QUOTING` — over adding an inline regex. Line-classification logic
  belongs in a helper like `flowchartStylingRepairReason`, which maps one line to
  one reason.
- `quoteLabelText` deliberately skips text that is already quoted or already
  bracketed. Widening `LABEL_NEEDS_QUOTING` is usually correct; special-casing
  inside `quoteFlowchartLabels` usually is not.

Keep the rule deterministic. The model-assisted fallback (`openai_auto_repair`)
is a separate path in `lib/excalidraw-routes.js` and is not what you are editing
here.

### 5. Document

Add one line to "Current repaired patterns" in `docs/AI_CONTRACT.md`, matching
the existing format:

```
- `<repair_reason>`: <what it removes or rewrites, one clause>.
```

If the repair makes something newly *forbidden* for the model, also add it to
the "Forbidden" list at the top — that section is what the prompt contract in
`lib/prompt-contracts.js` is built to enforce.

### 6. Verify

```bash
npm test
```

The full suite, not just the sanitize file. Repairs interact: a rule that strips
more aggressively can change output in `test/excalidraw-routes.test.js`, which
asserts end-to-end SSE payloads.

Report the actual output. If any test fails, that is the result — say so.

## Completion criteria

- [ ] Fixture in `test/fixtures/mermaid/`, minimal, reproduces the failure
- [ ] Case in the `cases` array with `name`, `fixture`, `repairPattern`, `expected`
- [ ] Test failed before the rule existed
- [ ] Rule in `lib/mermaid-sanitize.js` at the correct pipeline stage
- [ ] Reason string follows the `stripped_`/`normalized_`/`quoted_`/`added_` convention
- [ ] Line in `docs/AI_CONTRACT.md` under "Current repaired patterns"
- [ ] `npm test` passes, output read

## Branch: changing an existing repair

Same four files, different starting point. Locate the reason string first:

```bash
grep -rn "<repair_reason>" lib/ test/ docs/
```

Do not loosen a rule until you know which fixture proves the strict behavior —
the existing test is documenting a real Excalidraw import failure someone hit.
Add a second fixture for the case that is now over-stripped rather than
weakening the first one.

## Branch: the model output is invalid but not a known pattern

If the failure is unstructured — the model returned something arbitrary that no
deterministic rule can generalize — the correct fix is the prompt contract in
`lib/prompt-contracts.js` plus the `openai_auto_repair` fallback, not a new
sanitizer rule. A sanitizer rule is only worth adding when the broken pattern is
**recurring and syntactically identifiable**.
