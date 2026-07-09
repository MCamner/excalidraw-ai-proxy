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
