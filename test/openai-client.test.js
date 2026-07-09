import assert from "node:assert/strict";
import test from "node:test";

import { createOpenAIClient } from "../lib/openai-client.js";

test("createOpenAIClient passes SDK options through", () => {
  const client = createOpenAIClient({
    apiKey: "test-key",
    timeout: 1234,
    maxRetries: 5,
    Client: FakeOpenAI,
  });

  assert.deepEqual(client.options, {
    apiKey: "test-key",
    timeout: 1234,
    maxRetries: 5,
  });
});

class FakeOpenAI {
  constructor(options) {
    this.options = options;
  }
}
