# Excalidraw AI Proxy Workspace Instructions

This repository is a small Node.js proxy for Excalidraw AI features. The browser forwards AI requests to this server so the OpenAI API key remains on the server side.

Use this workspace prompt to help write, fix, and document repository-specific tasks.

## Purpose
- Keep the proxy small, secure, and easy to run locally.
- Support Excalidraw AI endpoints with OpenAI settings from `.env`.
- Keep `OPENAI_API_KEY` server-side only; never place it in Excalidraw/browser config.
- Treat Mermaid sanitizer and auto-repair changes as regression-sensitive logic.
- Make sure the repo uses workspace-scoped skills and files when asked.

## Useful context
- Main entrypoint: `server.js`
- Local dev command: `npm run dev`
- Proxy endpoints:
  - `POST /v1/ai/diagram-to-code/generate`
  - `POST /v1/ai/text-to-diagram/chat-streaming`
- Health endpoint: `GET /health`
- Example environment variables are in `.env.example`.

## Workspace skill
This repo includes a workspace skill in `SKILL.md`:
- `create-skill`: guides the user through creating a reusable `SKILL.md` file for this repository.

When asked to create or update repo-specific AI customization, prefer `create-skill` and keep output scoped to this project.

## Suggested prompts
- "Create a workspace skill for this Excalidraw AI proxy."
- "Write a `SKILL.md` that helps contributors add a new proxy endpoint."
- "Generate documentation and a companion skill file for this repo."
