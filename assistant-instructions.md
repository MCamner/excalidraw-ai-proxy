# Excalidraw AI Proxy — Assistant workspace instructions

This repository is a small Node.js proxy for Excalidraw AI. The browser forwards AI requests to this server so the OpenAI API key stays on the server.

## Repo overview

- Main entrypoint: `server.js`
- Local development: `npm run dev`
- Proxy endpoints:
  - `POST /v1/ai/diagram-to-code/generate`
  - `POST /v1/ai/text-to-diagram/chat-streaming`
- Health endpoint: `GET /health`
- Environment variables: see `.env.example`

## Workspace guidance

- Keep changes focused on proxy logic and endpoint handling.
- Do not expose `OPENAI_API_KEY` in client-side code.
- Keep configuration in `.env` and document new settings.
- Update `README.md` for any new endpoints or environment settings.
- Treat Mermaid sanitizer and auto-repair changes as regression-sensitive logic.
- Prefer repository-specific skills and files when asked.

## Repository skills

This repo includes a workspace skill in `SKILL.md`:

- `create-skill`: guide for creating a reusable `SKILL.md` file in this repo.

## Usage

Use this file as shared context for assistant interaction, with short and practical repo-focused responses.

## Example prompts

- "Create a workspace skill for this Excalidraw AI proxy."
- "Write a `SKILL.md` that helps contributors add a new proxy endpoint."
- "Explain how to test `POST /v1/ai/text-to-diagram/chat-streaming` locally."
