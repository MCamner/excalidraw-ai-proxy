# AI Output Contract

There are two text-to-diagram contracts. Both are defined in
`lib/prompt-contracts.js` and both require Mermaid flowchart code only, but the
architecture contract adds structural requirements and a size cap.

## Contract selection

The proxy picks a contract per request:

1. An explicit `mode` field in the request body wins: `"default"` or
   `"architecture"`. Unknown or missing values fall through to the heuristic, so
   clients that do not send `mode` — including Excalidraw itself — are
   unaffected. Available modes are reported in
   `GET /v1/ai/capabilities` under `features.promptContractModes`.
2. Otherwise a bilingual (Swedish/English) heuristic inspects the prompt.

The heuristic is two-tier, because selecting the architecture contract by
mistake silently narrows what the user asked for:

- **Strong signals** select the architecture contract on their own:
  `arkitektur`/`architecture`, `infrastruktur`/`infrastructure`,
  `mikrotjänst`/`microservice`, `c4`, `system design`/`systemdesign`,
  `topolog*`, `component diagram`/`komponentdiagram`.
- **Weak signals** are common in ordinary diagram requests and only select the
  architecture contract when architecture context is also present:
  `komponent`/`component`, `dataflöde`/`data flow`, `deployment`/`deploy`.
  Context means terms such as `system`, `backend`, `frontend`, `api`,
  `database`/`databas`, `server`, `service`, `module`/`modul`.

So `show the system components` selects the architecture contract, while
`show the components of a form` and `lägg till en komponent i formuläret` stay
on the default contract. The routing matrix is covered by tests in
`test/prompt-contracts.test.js`; add a case there when changing the heuristic.

## Shared output rules

The model must return Mermaid flowchart code only.

Allowed:

- `flowchart TD`
- `flowchart LR`
- nodes
- edges
- subgraphs
- simple labels

Forbidden:

- Markdown fences
- raw CSS-style class statements
- `class NODE fill:#fff...`
- HTML
- comments
- explanatory prose
- multiple alternative diagrams

## Default contract

For ordinary diagram requests:

- Prefer `flowchart TD` unless the user explicitly asks for a sequence diagram.
- Simple ASCII node IDs (`A`, `B`, `C`), labels like `A[Start]`, decisions like
  `C{Valid?}`.
- Quote labels that contain parentheses, slashes, ampersands, colons, or other
  punctuation.
- Edge labels in pipe form only: `C -->|Yes| D`.

## Architecture contract

For architecture and system-design requests. Everything in the default contract
applies, plus:

- `flowchart TD` specifically.
- Related components **must** be grouped in `subgraph` blocks with descriptive
  titles.
- Data and control flow shown with labeled edges.
- **Every** node label, subgraph title, and edge label quoted — not only the
  ones containing punctuation.
- Reserved words such as `end` must not be used as node IDs.
- **At most 25 nodes.**

The node cap and mandatory subgraphs are the reason contract selection matters:
a request routed here by mistake gets a materially more constrained diagram.

## Repair policy

The proxy may remove invalid or unsafe Mermaid lines when:

- the line is known to break Excalidraw rendering
- the line is styling-only
- removing it preserves the diagram structure

Every repaired pattern should have a regression test.

Current repaired patterns:

- `stripped_invalid_class_line`: remove raw CSS-like `class NODE fill:#fff...` lines.
- `stripped_classdef_line`: remove `classDef` styling lines from flowcharts.
- `stripped_style_line`: remove `style NODE fill:#fff...` lines from flowcharts.
- `stripped_prose_and_fences`: remove explanatory prose and Markdown code fences.
- `normalized_loose_edge_label`: convert `A -- label --> B` to `A -->|label| B`.
- `quoted_punctuation_labels`: quote flowchart node and edge labels containing Mermaid-significant punctuation.
- `added_default_flowchart`: add `flowchart TD` when Mermaid output has no diagram header.
- `openai_auto_repair`: use the model repair path after deterministic sanitizing when output still looks invalid.

## Failure classification and targeted retry

When the sanitized output still fails, `lib/mermaid-diagnostics.js` classifies
the failure and `lib/mermaid-repair.js` sends that class — with the parser
report — back to the model as a specific correction. A generic "try again"
retry is not used.

| Error type | Severity | Meaning |
| --- | --- | --- |
| `empty_diagram` | hard | Nothing left after sanitizing, or a header with no nodes |
| `unknown_diagram_type` | hard | No Mermaid header the parser recognizes |
| `unbalanced_subgraph` | hard | `subgraph` and `end` lines do not match |
| `reserved_node_id` | hard | `end` used as a node ID |
| `invalid_node_id` | hard | A node ID is not a single token, for example `my node[Label]` |
| `unquoted_label` | hard | A label contains punctuation Mermaid reads as syntax |
| `syntax_error` | hard | Any other parser error |
| `unsupported_diagram_type` | soft | Parses, but is not a flowchart, sequence, or class diagram |
| `node_limit_exceeded` | soft | Parses, but is larger than `MERMAID_MAX_NODES` |
| `upstream_timeout` | — | The repair call timed out; the loop stops |
| `upstream_error` | — | The repair call failed; the loop stops |

Rules:

- **Hard** failures fail the request with `502` if they survive the retries.
- Mermaid accepts a bare `flowchart TD`, and the sanitizer produces exactly that
  from prose-only or fence-only output. `empty_diagram` therefore also covers a
  flowchart with zero nodes, so that case is repaired or failed rather than
  streamed as a successful empty diagram. It is the only class where the repair
  prompt also carries the original request, because the source itself contains
  nothing to repair.
- **Soft** failures are served. An importable diagram that is bigger than we
  would like still beats no diagram.
- At most `MERMAID_MAX_REPAIR_ATTEMPTS` model repairs, capped at two in code.
  Each attempt is reclassified, so a second attempt targets whatever is wrong
  *after* the first one.
- The best candidate is kept: valid beats importable-but-flawed beats broken. A
  retry cannot make the response worse.
- Logs record error type, severity, node count, and attempt outcome
  (`resolved`, `improved`, `unresolved`, `upstream_timeout`, `upstream_error`).
  Prompts and diagram source are never logged — the raw parser message embeds
  the diagram, so it goes to the model only.

New failure classes need a fixture in `test/fixtures/mermaid/`, a case in
`test/mermaid-diagnostics.test.js`, a repair instruction in
`lib/mermaid-repair.js`, and a row in the table above.
