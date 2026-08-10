# Copilot instructions

Read [CLAUDE.md](../CLAUDE.md) for repo layout, commands, and working rules. It
is the source of truth; this file only exists because Copilot reads this path.

Key constraints:

- This is a local proxy that keeps `OPENAI_API_KEY` server-side. Never suggest
  moving the key or model calls into client code.
- Endpoint paths and response shapes must stay compatible with Excalidraw OSS.
- The Mermaid sanitizer in `lib/mermaid-sanitize.js` is regression-sensitive.
  Every repair pattern needs a fixture in `test/fixtures/mermaid/`, a case in
  `test/sanitize-mermaid.test.js`, and a line in `docs/AI_CONTRACT.md`. The full
  workflow is in `.claude/skills/mermaid-repair/SKILL.md`.
- Tests run with `npm test` (`node --test`, mocked OpenAI clients).
