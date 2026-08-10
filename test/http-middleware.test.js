import assert from "node:assert/strict";
import cors from "cors";
import express from "express";
import test from "node:test";

import {
  createCorsOptions,
  createRateLimiter,
  handleHttpError,
} from "../lib/http-middleware.js";

test("CORS allows configured origins and rejects other browser origins", async () => {
  const app = express();
  app.use(cors(createCorsOptions(["http://localhost:3003"])));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use((error, _req, res, _next) => handleHttpError(error, res));
  const server = await listen(app);

  try {
    const allowed = await fetch(`${server.url}/health`, {
      headers: { Origin: "http://localhost:3003" },
    });
    const rejected = await fetch(`${server.url}/health`, {
      headers: { Origin: "https://example.invalid" },
    });

    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:3003");
    assert.equal(rejected.status, 403);
    assert.deepEqual(await rejected.json(), {
      message: "Request failed",
      statusCode: 403,
    });
  } finally {
    await close(server.instance);
  }
});

test("rate limiter returns 429 and removes expired client buckets", async () => {
  let currentTime = 0;
  const limiter = createRateLimiter({
    windowMs: 1_000,
    maxRequests: 1,
    now: () => currentTime,
  });
  const app = express();
  app.set("trust proxy", true);
  app.use(limiter);
  app.get("/health", (_req, res) => res.json({ ok: true }));
  const server = await listen(app);

  try {
    const first = await fetch(`${server.url}/health`, { headers: { "X-Forwarded-For": "192.0.2.1" } });
    const limited = await fetch(`${server.url}/health`, { headers: { "X-Forwarded-For": "192.0.2.1" } });
    assert.equal(first.status, 200);
    assert.equal(limited.status, 429);
    assert.equal(limiter.bucketCount(), 1);

    currentTime = 1_001;
    const nextClient = await fetch(`${server.url}/health`, { headers: { "X-Forwarded-For": "192.0.2.2" } });
    assert.equal(nextClient.status, 200);
    assert.equal(limiter.bucketCount(), 1);
  } finally {
    await close(server.instance);
  }
});

test("HTTP errors do not expose upstream messages", () => {
  let responseBody;
  const response = {
    status(statusCode) {
      assert.equal(statusCode, 502);
      return this;
    },
    json(body) {
      responseBody = body;
    },
  };

  handleHttpError(Object.assign(new Error("secret upstream response"), { status: 502 }), response);
  assert.deepEqual(responseBody, {
    message: "Upstream service error",
    statusCode: 502,
  });
});

function listen(app) {
  return new Promise((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => {
      const address = instance.address();
      resolve({ instance, url: `http://127.0.0.1:${address.port}` });
    });
    instance.on("error", reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
