import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY = "test-secret-key";
process.env.OPENAI_TEXT_TO_DIAGRAM_MODEL = "test-text-model";
process.env.OPENAI_DIAGRAM_TO_CODE_MODEL = "test-code-model";
process.env.MERMAID_AUTO_REPAIR = "true";

const { app, getCapabilities } = await import("../server.js");

test("getCapabilities reports supported features without secrets", () => {
  const capabilities = getCapabilities();
  const serialized = JSON.stringify(capabilities);

  assert.equal(capabilities.ok, true);
  assert.deepEqual(capabilities.features, {
    textToDiagram: true,
    diagramToCode: true,
    streaming: true,
    streamingMode: "buffered-after-repair",
    mermaidAutoRepair: true,
    promptContractModes: ["default", "architecture"],
  });
  assert.equal(capabilities.models.textToDiagram, "test-text-model");
  assert.equal(capabilities.models.diagramToCode, "test-code-model");
  assert.equal(serialized.includes("test-secret-key"), false);
  assert.equal(serialized.includes("OPENAI_API_KEY"), false);
});

test("GET /v1/ai/capabilities returns capability metadata", async () => {
  const server = await listen(app);

  try {
    const response = await fetch(`${server.url}/v1/ai/capabilities`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.features.textToDiagram, true);
    assert.equal(body.features.diagramToCode, true);
    assert.equal(body.features.streaming, true);
    assert.equal(body.features.streamingMode, "buffered-after-repair");
    assert.equal(body.features.mermaidAutoRepair, true);
    assert.deepEqual(body.features.promptContractModes, ["default", "architecture"]);
    assert.equal(JSON.stringify(body).includes("test-secret-key"), false);
  } finally {
    await close(server.instance);
  }
});

function listen(app) {
  return new Promise((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => {
      const address = instance.address();
      resolve({
        instance,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
    instance.on("error", reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
