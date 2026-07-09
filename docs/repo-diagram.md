# Repository Diagram

This repo includes a visual architecture diagram in Excalidraw format:

- `docs/repo-diagram.excalidraw`

You can open that file in Excalidraw to inspect and edit the diagram.

## Repo architecture

```mermaid
flowchart TB
  A[Excalidraw Browser UI]
  B[Proxy Server\nserver.js]
  C[OpenAI API]
  D[Environment\n.env / OPENAI_API_KEY]

  A -->|AI requests| B
  B -->|Diagram and code generation| C
  B -->|Secret stored locally| D
  D -.->|Config read by| B
```

## Notes

- The Excalidraw file is the source artifact for this diagram.
- The proxy server exposes the AI endpoints used by the browser.
- The OpenAI API key is kept server-side in `.env`.
