# Excalidraw AI Proxy

A local Node.js proxy that gives Excalidraw OSS its AI features without exposing
the OpenAI API key to the browser. It implements Excalidraw-compatible endpoints
and normalizes model output so Excalidraw's Mermaid parser can import it.

This repo is the AI backend, not the editor. The editor is a separate local
checkout of [Excalidraw OSS](https://github.com/excalidraw/excalidraw).

## Layout

| Path | Contents |
| --- | --- |
| `server.js` | Express app, env config, CORS, rate limiting, request logging |
| `lib/excalidraw-routes.js` | Endpoint handlers, SSE streaming, model-assisted repair |
| `lib/mermaid-sanitize.js` | Deterministic Mermaid repair pipeline |
| `lib/mermaid-parser.js` | Real Mermaid parser behind jsdom, used by `isValidMermaid` |
| `lib/prompt-contracts.js` | System prompts that constrain model output |
| `lib/http-middleware.js` | CORS options, rate limiter, error handler |
| `test/` | `node --test` suite with mocked OpenAI clients |
| `docs/AI_CONTRACT.md` | What the model may emit and which repairs exist |

Endpoints: `GET /health`, `GET /v1/ai/capabilities`,
`POST /v1/ai/text-to-diagram/chat-streaming`,
`POST /v1/ai/diagram-to-code/generate`.

## Commands

```bash
npm run dev                          # watch mode on 127.0.0.1:3016
npm test                             # full suite, no API key needed
node --test test/<file>.test.js      # single file
```

The suite uses mocked OpenAI clients. Only put a real key in `.env` when
manually exercising model-backed endpoints.

## Working rules

1. Keep changes focused on proxy logic. No incidental refactors.
2. Never expose `OPENAI_API_KEY` to client-side code or to responses.
3. Treat the Mermaid sanitizer and auto-repair as regression-sensitive. Every
   repair pattern needs a fixture and a test.
4. Keep endpoint paths and response shapes compatible with Excalidraw OSS —
   the client is an external codebase this proxy must match, not the reverse.
5. Update `.env.example` and `README.md` when configuration or endpoints change.
6. Run `npm test` and read the output before calling anything done.

## Skills

Workspace skills live in `.claude/skills/<name>/SKILL.md` and load
automatically by their `description`.

- **`mermaid-repair`** — add or change a deterministic Mermaid repair pattern.
  Covers the four places that must stay in sync (fixture, sanitizer rule,
  regression test, `docs/AI_CONTRACT.md`) and the ordering constraints in the
  sanitize pipeline. Use it instead of patching `lib/mermaid-sanitize.js`
  directly.

## Instruction files

This file is the source of truth. `AGENTS.md` and `.github/copilot-instructions.md`
are thin pointers for tools that read those paths instead. Change the content
here; keep the pointers short so they cannot drift.
