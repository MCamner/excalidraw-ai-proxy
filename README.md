# Excalidraw AI Proxy

[![CI](https://github.com/MCamner/excalidraw-ai-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/MCamner/excalidraw-ai-proxy/actions/workflows/ci.yml)

Small server-side proxy for Excalidraw OSS AI features. The browser only sees this server; `OPENAI_API_KEY` stays in `.env` on the server.

- [Quick start](QUICKSTART.md)
- [Installation](INSTALL.md)
- [Security policy](SECURITY.md)
- [MIT license](LICENSE)

## Setup

Clone this repository, then create your local server configuration:

```bash
cp .env.example .env
npm install
npm run dev
```

Replace the placeholder `OPENAI_API_KEY` in `.env` with your own key. Keep this
file server-side and do not add it to your Excalidraw configuration.

Then configure your local Excalidraw OSS checkout. In its `.env.local`, set:

```env
VITE_APP_AI_BACKEND=http://localhost:3016
VITE_APP_PORT=3003
```

Start Excalidraw from that checkout:

```bash
yarn
yarn start
```

Your checkout path may be different. If you change either port, update the
backend URL and `ALLOWED_ORIGINS` so they continue to match.

## My local development setup

This project was developed with:

- the proxy on `http://localhost:3016`
- Excalidraw OSS on `http://localhost:3003`

These are the documented defaults; your local paths may be different.

## Config sanity

- Proxy port: `3016`
- Excalidraw local port: `3003`
- Default allowed origins: `http://localhost:3003,http://127.0.0.1:3003`
- API key location: server-side `.env` as `OPENAI_API_KEY`

Use `.env.example` as the source of truth for local runtime settings. Add new runtime settings there when they are added to the proxy.

## Endpoints

- `GET /health`
- `GET /v1/ai/capabilities`
- `POST /v1/ai/diagram-to-code/generate`
- `POST /v1/ai/text-to-diagram/chat-streaming`

Text-to-diagram uses buffered streaming after repair: the proxy receives streamed model output, buffers it, sanitizes or repairs Mermaid, then sends the final Mermaid back as SSE chunks. Raw model streaming is intentionally not passed directly to Excalidraw because stable diagram import matters more than lower latency.

Repair and request logs record behavior, not prompt bodies. Example:

```json
{"event":"request_completed","endpoint":"POST /v1/ai/text-to-diagram/chat-streaming","statusCode":200,"repairApplied":true,"repairReasons":["stripped_invalid_class_line"]}
```

## Project direction

- [AI output contract](docs/AI_CONTRACT.md)
- [Roadmap](docs/ROADMAP.md)

## Tests

```bash
npm test
```

CI runs the same command on pushes and pull requests to `main`.

## Settings

Useful `.env` settings:

```env
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TEXT_TO_DIAGRAM_MODEL=gpt-4.1-mini
OPENAI_DIAGRAM_TO_CODE_MODEL=gpt-4.1-mini
OPENAI_TIMEOUT_MS=45000
OPENAI_MAX_RETRIES=2

TEXT_TO_DIAGRAM_TEMPERATURE=0.1
TEXT_TO_DIAGRAM_MAX_TOKENS=1600
DIAGRAM_TO_CODE_MAX_TOKENS=4000
MERMAID_AUTO_REPAIR=true

MAX_PROMPT_CHARS=6000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20
```

For higher quality diagram-to-code output, set `OPENAI_DIAGRAM_TO_CODE_MODEL` to a stronger multimodal model while keeping `OPENAI_TEXT_TO_DIAGRAM_MODEL` on a faster, cheaper model.

## Workspace instruction files

This repository includes workspace-specific assistant guidance in the following files:

- `assistant-instructions.md`
- `copilot-instructions.md`
- `claude-instructions.md`
- `codex-instructions.md`
- `SKILL.md`

Use these files to provide consistent, project-focused answers and to keep AI assistance aligned with the proxy server’s policy: small changes, secure API key handling, and documented endpoint updates.
