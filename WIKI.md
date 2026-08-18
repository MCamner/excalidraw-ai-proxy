# Excalidraw AI Proxy Wiki

This repository provides a local Node.js proxy for Excalidraw OSS AI features.
It keeps OpenAI access and credentials outside the browser while preserving
the endpoint shapes expected by Excalidraw.

## Start here

- [Quick start](QUICKSTART.md)
- [Full installation guide](INSTALL.md)
- [API examples](docs/EXAMPLES.md)
- [AI output contract](docs/AI_CONTRACT.md)
- [Architecture](https://github.com/MCamner/excalidraw-ai-proxy/blob/main/docs/repo-diagram.md)
- [Roadmap](https://github.com/MCamner/excalidraw-ai-proxy/blob/main/docs/ROADMAP.md)

## Supported endpoints

- `GET /health`
- `GET /v1/ai/capabilities`
- `POST /v1/ai/diagram-to-code/generate`
- `POST /v1/ai/text-to-diagram/chat-streaming`

## Local defaults

- proxy: `http://localhost:3016`
- Excalidraw: `http://localhost:3003`
- allowed origins: `http://localhost:3003,http://127.0.0.1:3003`

Paths to the proxy and Excalidraw checkouts are machine-specific. Keep `.env`
out of version control and keep `OPENAI_API_KEY` in the proxy configuration
only.

## Maintenance rule

When an endpoint or environment setting changes, update `.env.example`, the
README documentation table, and the relevant test in the same pull request.
