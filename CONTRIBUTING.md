# Contributing

Contributions that improve Excalidraw compatibility, Mermaid repair, tests, or
documentation are welcome.

## Development setup

```bash
git clone https://github.com/MCamner/excalidraw-ai-proxy.git
cd excalidraw-ai-proxy
npm install
cp .env.example .env
npm test
```

The test suite uses mocked OpenAI clients and does not require a real API key.
Only add a key to `.env` when manually testing model-backed endpoints. Never
commit `.env`, keys, prompts containing sensitive data, or generated secrets.

## Making a change

1. Create a focused branch from `main`.
2. Add or update tests for behavior changes.
3. Keep endpoint paths and response shapes compatible with Excalidraw OSS.
4. Update `.env.example` and documentation when configuration changes.
5. Run `npm test` before opening a pull request.

For Mermaid fixes, add the failing input as a small fixture under
`test/fixtures/mermaid/` and a regression test that documents the expected
normalization. Also add the repair pattern to the "Current repaired patterns"
list in [docs/AI_CONTRACT.md](docs/AI_CONTRACT.md). The full workflow is written
up in `.claude/skills/mermaid-repair/SKILL.md`.

## Versioning and distribution

This project follows semantic versioning. Update the version in `package.json`
only as part of a tagged GitHub release. The proxy is installed from source and
is intentionally marked private so it cannot be published to npm accidentally.

## Pull requests

Keep pull requests small and explain why the change is needed. Include the
commands used to verify behavior. Do not combine unrelated refactors with a
feature or bug fix.

Security vulnerabilities must not be reported in a public issue or pull
request. Follow [SECURITY.md](SECURITY.md) instead.
