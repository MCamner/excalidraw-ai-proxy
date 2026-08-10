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
