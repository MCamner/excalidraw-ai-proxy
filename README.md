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
