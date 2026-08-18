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
only as part of a tagged GitHub release.

Tags are annotated, never lightweight, and named `vMAJOR.MINOR.PATCH`. The
subject names the release theme and the body says what changed, so `git tag -n`
answers what a version contained without opening anything:

```bash
git tag -a v0.2.0 -m "v0.2.0 — diagram-aware retry, model routing"
```

Earlier tags predate this: `v0.1.0` carries only its own version as the subject
and `v0.1.1` is lightweight. They are released and stay as they are — a pushed
tag is published history and is not rewritten for style.

Creating a GitHub release publishes `@mcamner/excalidraw-ai-proxy` to GitHub
Packages through `.github/workflows/publish.yml`. Two things therefore have to
hold before tagging:

1. The tag and `package.json` agree. CI verifies this before `npm publish`, and
   you can check it locally first:

   ```bash
   node scripts/check-release-version.mjs v0.2.0
   ```

2. The package ships what it should. The `files` field in `package.json` is the
   contract — runtime code plus the documentation a consumer needs, nothing
   else — and `test/package-contents.test.js` asserts the real `npm pack`
   output against it. Inspect it with:

   ```bash
   npm pack --dry-run
   ```

## Pull requests

Keep pull requests small and explain why the change is needed. Include the
commands used to verify behavior. Do not combine unrelated refactors with a
feature or bug fix.

Security vulnerabilities must not be reported in a public issue or pull
request. Follow [SECURITY.md](SECURITY.md) instead.
