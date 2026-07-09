# Roadmap

This proxy should become stable and testable before it grows new features.

The main risk is the translation layer between free-form user prompts, model output, Mermaid syntax, and Excalidraw rendering. Every Mermaid failure should become a small contract or regression test.

## Current focus

Stabilize the AI output contract and Mermaid sanitizer feedback loop:

```text
LLM output -> Mermaid error -> sanitizer fix -> regression test -> permanent learning
```

## Phase 1: Contract and Regression Tests

Status: complete.

- [x] Add `docs/AI_CONTRACT.md`.
- [x] Add `npm test` using Node's built-in test runner.
- [x] Export `sanitizeMermaid` for focused tests.
- [x] Add a regression fixture for leaked raw CSS class styling.
- [x] Verify that `class LEGEND fill:#fff...` is removed while preserving diagram structure.
- [x] Add more fixtures for known Mermaid parser failures.
- [x] Document each sanitizer repair pattern next to its test.

Success criteria:

- Every known sanitizer rule has at least one regression test.
- `npm test` is the default local confidence check.
- Importing testable functions does not start the HTTP server.

## Phase 2: Better Observability

Status: complete.

- [x] Track whether Mermaid repair was applied.
- [x] Log repair reasons, for example `stripped_invalid_class_line`.
- [x] Keep logs local and avoid storing prompts unless explicitly needed for debugging.
- [x] Add concise error paths for empty, invalid, or over-limit model output.

Success criteria:

- A broken model response can be diagnosed without guessing.
- Sanitizer behavior is visible enough to improve prompts or tests.

## Phase 3: Compatibility Checks

Status: complete.

- [x] Keep `GET /health` available for basic liveness.
- [x] Add `GET /v1/ai/capabilities`.
- [x] Report supported proxy features, such as text-to-diagram, diagram-to-code, streaming, model names, and Mermaid auto-repair.
- [x] Keep the response free of secrets and API keys.

Success criteria:

- A local Excalidraw setup can quickly verify whether the proxy supports the expected AI surface.
- Capability output helps catch endpoint drift from upstream Excalidraw changes.

## Phase 4: Split Server Responsibilities

Status: planned.

Keep `server.js` small once test coverage exists. Candidate structure:

```text
server.js
lib/openai-client.js
lib/excalidraw-routes.js
lib/mermaid-sanitize.js
lib/mermaid-repair.js
lib/prompt-contracts.js
test/fixtures/
```

Success criteria:

- Sanitizer, prompt contracts, OpenAI client setup, and route handling can be tested separately.
- Refactors preserve the existing endpoints and local dev command.

## Not Now

- Do not add more AI endpoints before the current contracts are tested.
- Do not expose `OPENAI_API_KEY` to browser or Excalidraw config.
- Do not make the proxy public without authentication and stricter abuse controls.
