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

Status: complete.

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

- [x] Extract Mermaid sanitizer logic to `lib/mermaid-sanitize.js`.
- [x] Extract prompt contracts to `lib/prompt-contracts.js`.
- [x] Extract OpenAI client setup to `lib/openai-client.js`.
- [x] Extract route registration and handlers to `lib/excalidraw-routes.js`.

Success criteria:

- Sanitizer can be tested separately through `lib/mermaid-sanitize.js`.
- Prompt contracts can be tested separately through `lib/prompt-contracts.js`.
- OpenAI client setup can be tested separately through `lib/openai-client.js`.
- Route handling can be tested separately through `lib/excalidraw-routes.js`.
- Refactors preserve the existing endpoints and local dev command.

## Phase 5: Endpoint Integration Tests and Config Hardening

Status: complete.

This phase protects the outer system boundary: the contract between Excalidraw, the proxy HTTP endpoints, mocked OpenAI responses, Mermaid repair, and the final response format.

The inner loop is now covered by sanitizer tests:

```text
LLM output -> Mermaid error -> sanitizer fix -> regression test
```

Phase 5 covers the outer loop:

```text
Excalidraw request -> proxy endpoint -> OpenAI/mock -> repair -> HTTP/SSE response
```

The goal is not to add new AI features. The goal is to make the existing proxy harder to break.

### 5.1 Align Local Configuration Defaults

- [x] Align default `ALLOWED_ORIGINS` with the README local Excalidraw port.
- [x] Document that `.env.example` is the source of truth for local runtime settings.
- [x] Add a short config sanity section to README.

### 5.2 Add HTTP Integration Tests

- [x] Add integration test coverage for `GET /health`.
- [x] Add integration test coverage for `GET /v1/ai/capabilities`.
- [x] Add integration test coverage for missing text-to-diagram messages.
- [x] Add integration test coverage for over-limit text-to-diagram prompts.
- [x] Add integration test coverage for missing diagram-to-code image input.

### 5.3 Add Mocked OpenAI Endpoint Tests

- [x] Test text-to-diagram with a mocked OpenAI stream.
- [x] Test text-to-diagram repair behavior through the endpoint.
- [x] Test invalid Mermaid after repair.
- [x] Test empty OpenAI response handling.

### 5.4 Clarify Streaming Semantics

- [x] Document that text-to-diagram uses buffered streaming after repair.
- [x] Add `streamingMode` to capabilities output.
- [x] Add a README note explaining why raw model streaming is intentionally not passed directly to Excalidraw.

### 5.5 Improve Observability Without Storing Prompts

- [x] Add request-scoped logging for endpoint, latency, repair status, and error type.
- [x] Keep prompt bodies out of normal logs.
- [x] Add one repair-log example to README or WIKI.

### 5.6 Keep Test Tooling Minimal

- [x] Decide whether to use `supertest` or native Node HTTP tests.
- [x] Add any new test dependency as `devDependency`, not `dependency`.
- [x] Keep `npm test` as the single confidence command.

Success criteria:

- [x] `npm test` covers both Mermaid sanitizer behavior and HTTP endpoint behavior.
- [x] The proxy can be imported in tests without starting the HTTP listener.
- [x] `/health` and `/v1/ai/capabilities` are covered by tests.
- [x] Text-to-diagram SSE behavior is covered with mocked OpenAI output.
- [x] Invalid or empty model output fails clearly.
- [x] Prompt length and missing input errors are tested.
- [x] Capabilities describe the actual streaming mode.
- [x] README and `.env.example` agree on local ports and origins.
- [x] No test requires a real `OPENAI_API_KEY`.

### Not In Scope For Phase 5

- [ ] Do not add new AI endpoints.
- [ ] Do not expose the proxy publicly.
- [ ] Do not add authentication yet.
- [ ] Do not add persistent prompt logging.
- [ ] Do not optimize for lower latency before endpoint correctness is tested.
- [ ] Do not change model defaults unless tests prove the current model path is unstable.

## Phase 6: CI and Release Confidence

Status: complete.

This phase makes the local confidence command run automatically before changes are merged.

- [x] Add GitHub Actions workflow for push and pull request checks.
- [x] Use `npm ci` so CI installs from `package-lock.json`.
- [x] Run `npm test` in CI.
- [x] Document `npm test` as the local and CI confidence command.
- [x] Add CI status badge to README.

Success criteria:

- [x] CI uses the same test command as local development.
- [x] CI does not require a real `OPENAI_API_KEY`.
- [x] Runtime dependencies remain unchanged.

## Phase 7: Diagram-Aware Retry

Status: complete.

The sanitizer fixes what is deterministically fixable. Everything else used to
get one generic "repair this" pass, which is a weak signal for the model and
gives the logs nothing to aggregate. Phase 7 classifies the failure first and
retries against that specific error.

- [x] Add `lib/mermaid-diagnostics.js` with a fixed vocabulary of failure types.
- [x] Classify parser failures: unbalanced subgraph, `end` as node ID, invalid
      node ID, unquoted label, unknown diagram type, other syntax errors.
- [x] Classify importable-but-flawed output: unsupported diagram type for the
      Excalidraw importer, node count above the budget.
- [x] Treat a flowchart header with no nodes as an empty diagram.
- [x] Add `lib/mermaid-repair.js` with one targeted instruction per failure type.
- [x] Reclassify between attempts and cap the loop at two model repairs.
- [x] Keep the best candidate so a retry cannot make the response worse.
- [x] Serve soft failures, fail hard failures with `502`.
- [x] Log failure type, severity, node count, and attempt outcome only.
- [x] Report the limits in `GET /v1/ai/capabilities`.

Success criteria:

- [x] Each failure class has a fixture and a diagnostics test.
- [x] The repair prompt contains the classified error, proven by test.
- [x] Prompts and diagram source stay out of the logs.
- [x] `npm test` covers the retry loop and the endpoint behavior.

## Phase 8: Provider-Neutral Model Routing

Status: complete.

A thin model registry above the OpenAI client so the proxy picks a model per
task instead of using one model for everything.

- [x] Add `lib/model-registry.js` with `supportsJson`, `supportsStreaming`,
      `supportsImageInput`, `maxOutput`, `contextWindow`, `diagramQualityTier`,
      and `costTier` per model.
- [x] Route four tasks: text-to-diagram, text-to-diagram:architecture,
      mermaid-repair, diagram-to-code.
- [x] Resolve each task as configured model, then `OPENAI_MODEL_POOL`, then
      fallback, so the proxy never calls a model the operator did not name.
- [x] Pick from the pool by task requirements: cheapest that can stream for a
      plain flowchart, strongest for architecture, cheapest small one for the
      repair pass, image input for diagram-to-code.
- [x] Clamp the configured token budget to a known model's documented limit.
- [x] Treat an unlisted model as capable but unknown, so a newer model keeps
      working without a registry update.
- [x] Warn at startup when a known model is routed to a task it cannot perform.
- [x] Report the resolved model, the reason, and the tiers in
      `GET /v1/ai/capabilities`.

Success criteria:

- [x] Default configuration resolves exactly as before this phase.
- [x] The routing matrix is covered by tests, including the endpoints.
- [x] No provider SDK leaks into the route handlers and no key reaches the
      capabilities output.

The registry stays a table. Adding a second provider means adding rows and a
client, not rewriting the routes. This stays a proxy; it does not become an AI
platform.

Phase 7 came first on purpose: routing between models is only worth doing once
the quality pipeline it feeds is stable and measurable.

## Not Now

- Do not add more AI endpoints before the current contracts are tested.
- Do not expose `OPENAI_API_KEY` to browser or Excalidraw config.
- Do not make the proxy public without authentication and stricter abuse controls.
