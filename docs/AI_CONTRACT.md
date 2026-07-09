# AI Output Contract

## Text-to-diagram output rules

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
