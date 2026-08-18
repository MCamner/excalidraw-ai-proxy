# Agent instructions

Read [CLAUDE.md](CLAUDE.md) first. It is the source of truth for this repo:
layout, commands, and working rules. Everything below is additional.

## Skills

`.claude/skills/<name>/SKILL.md` holds task-specific workflows. Claude Code
loads them automatically; other agents do not. Read the relevant file yourself
before starting:

- **`.claude/skills/mermaid-repair/SKILL.md`** — read this before changing
  `lib/mermaid-sanitize.js`, adding a Mermaid repair pattern, or fixing Mermaid
  that Excalidraw cannot import. It documents the four files that must stay in
  sync and the ordering constraints in the sanitize pipeline.

## Non-negotiables

- `OPENAI_API_KEY` stays server-side. Never in client code, never in a response.
- Endpoint paths and response shapes must stay compatible with Excalidraw OSS.
- Every Mermaid repair pattern needs a fixture in `test/fixtures/mermaid/` and a
  regression test.
- Run `npm test` and read the output before reporting work as complete.
