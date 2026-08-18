# API examples

These examples use the default proxy address, `http://127.0.0.1:3016`. Start
the proxy with `npm run dev` before running them. Requests that call OpenAI use
the API key configured in the proxy's `.env` and may incur provider charges.

## Health

```bash
curl http://127.0.0.1:3016/health
```

Response:

```json
{"ok":true}
```

## Capabilities

```bash
curl http://127.0.0.1:3016/v1/ai/capabilities
```

The response reports enabled features, endpoint paths, configured model names,
request limits, and the text-to-diagram streaming mode. It never includes the
OpenAI API key.

## Text to diagram

```bash
curl --no-buffer \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"Show a user request flowing through the proxy to OpenAI"}]}' \
  http://127.0.0.1:3016/v1/ai/text-to-diagram/chat-streaming
```

The endpoint returns server-sent events containing normalized Mermaid chunks,
followed by a completion event and `[DONE]`:

```text
data: {"type":"content","delta":"flowchart LR\n  A[Excalidraw] --> B[Proxy]"}

data: {"type":"done","finishReason":"stop"}

data: [DONE]
```

Exact diagram content depends on the prompt and configured model. The response
shape above is the stable proxy contract.

To pick the prompt contract explicitly instead of relying on the heuristic, add
`mode`:

```json
{
  "messages": [{ "role": "user", "content": "show the components of a form" }],
  "mode": "architecture"
}
```

Accepted values are `"default"` and `"architecture"`. Unknown or missing values
fall back to prompt-based selection. See the
[AI output contract](AI_CONTRACT.md) for what each contract requires.

### Message handling

The proxy uses the **last message with `role: "user"`**, not the last message in
the array, so a trailing assistant turn does not break the request. Message
`content` may be a plain string or an array of parts; array parts are flattened
to text, joined with newlines, and non-text parts are ignored:

```json
{
  "messages": [
    { "role": "user", "content": "stale prompt" },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "boxes" },
        { "type": "text", "text": "arrows" }
      ]
    },
    { "role": "assistant", "content": "sure" }
  ]
}
```

The prompt sent to the model is `boxes\narrows`. `MAX_PROMPT_CHARS` is measured
against that flattened text.

### Truncated upstream streams

If the OpenAI stream closes prematurely after some content has arrived, the
proxy normalizes the buffered content and returns it rather than failing. A
premature close before any content arrives is rethrown and surfaces as `500`
with the generic `Upstream service error` body.

## Diagram to code

Excalidraw sends a data URL for the rendered diagram, extracted text, and the
current theme:

```json
{
  "texts": ["Dashboard", "Sign in"],
  "image": "data:image/png;base64,...",
  "theme": "dark"
}
```

Send that payload to:

```text
POST /v1/ai/diagram-to-code/generate
```

Successful responses contain one self-contained HTML document:

```json
{
  "html": "<!doctype html><html>...</html>"
}
```

## Common checks

- `400 Missing messages`: include a non-empty `messages` array.
- `400 Missing image`: include the diagram as a data URL in `image`.
- `413 Prompt is too long`: shorten the prompt or adjust `MAX_PROMPT_CHARS`.
- `429 Too many requests`: wait for the `Retry-After` interval. The same value
  is in the JSON body as `retryAfterSeconds`, so clients can back off without
  reading headers:

  ```json
  {"message":"Too many requests","retryAfterSeconds":42}
  ```

  Rate limiting is per client IP, in-memory, and resets per
  `RATE_LIMIT_WINDOW_MS` window.
- CORS rejection: add the exact Excalidraw origin to `ALLOWED_ORIGINS`.
