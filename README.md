# Excalidraw AI Proxy

Small server-side proxy for Excalidraw OSS AI features. The browser only sees this server; `OPENAI_API_KEY` stays in `.env` on the server.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Then run Excalidraw from `/Users/mansys/excalidraw`:

```bash
yarn
yarn start
```

Excalidraw reads `/Users/mansys/excalidraw/.env.local`:

```env
VITE_APP_AI_BACKEND=http://localhost:3016
VITE_APP_PORT=3003
```

## Endpoints

- `POST /v1/ai/diagram-to-code/generate`
- `POST /v1/ai/text-to-diagram/chat-streaming`

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
