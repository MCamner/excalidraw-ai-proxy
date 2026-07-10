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
- `429 Too many requests`: wait for the `Retry-After` interval.
- CORS rejection: add the exact Excalidraw origin to `ALLOWED_ORIGINS`.
