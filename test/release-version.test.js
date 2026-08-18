import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// The guard runs in CI between `npm ci` and `npm publish`, where a wrong answer
// means either a failed release or a package published under a version nobody
// released. It is cheap to run, so it is tested rather than trusted.
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

test("the guard accepts a tag that matches package.json", () => {
  const result = runGuard(`v${packageVersion}`);

  assert.equal(result.status, 0);
  assert.match(result.stdout, new RegExp(`matches package.json ${packageVersion}`));
});

test("the guard accepts a full ref as well as a bare tag", () => {
  assert.equal(runGuard(`refs/tags/v${packageVersion}`).status, 0);
  assert.equal(runGuard(packageVersion).status, 0);
});

test("the guard rejects a tag that does not match package.json", () => {
  const result = runGuard("v9.9.9");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /tag says 9\.9\.9/);
  assert.match(result.stderr, new RegExp(`package\\.json says ${packageVersion.replace(/\./g, "\\.")}`));
});

test("the guard rejects a missing tag instead of passing silently", () => {
  const result = runGuard();

  assert.equal(result.status, 1);
  assert.match(result.stderr, /No release tag given/);
});

function runGuard(reference) {
  const args = ["scripts/check-release-version.mjs"];
  if (reference !== undefined) {
    args.push(reference);
  }

  return spawnSync(process.execPath, args, { encoding: "utf8" });
}
