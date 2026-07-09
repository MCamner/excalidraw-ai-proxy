# Excalidraw AI Proxy Wiki

This repo is a minimal Node.js proxy for Excalidraw AI functionality. It separates client-side UI from server-side OpenAI access so the API key remains secure.

## Purpose

- Proxy AI requests from Excalidraw to OpenAI.
- Keep the browser unaware of the API key.
- Offer a simple local dev experience with `npm run dev`.

## Files

- `server.js` — main Express proxy server.
- `package.json` — dependencies and scripts.
- `.env.example` — example environment configuration.
- `SKILL.md` — workspace skill for creating reusable `SKILL.md` files.
- `assistant-instructions.md` — generic assistant workspace guidance.
- `copilot-instructions.md` — Copilot-specific workspace guidance.
- `claude-instructions.md` — Claude-specific workspace guidance.
- `codex-instructions.md` — Codex-specific workspace guidance.

## Endpoints

- `POST /v1/ai/diagram-to-code/generate`
- `POST /v1/ai/text-to-diagram/chat-streaming`

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

Then run Excalidraw from `/Users/mansys/excalidraw` with:

```bash
yarn
yarn start
```

## Notes

- Keep `.env` out of version control.
- Document any new endpoints or `.env` settings in `README.md`.
- Use `docs/AI_CONTRACT.md` and `docs/ROADMAP.md` to keep Mermaid sanitizer work testable.
- Use the workspace instruction files to keep AI-generated changes aligned with repo expectations.
