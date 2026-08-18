import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

// What gets published is part of the contract, not a side effect. Releases
// publish the package automatically, and before the `files` field existed the
// only thing keeping `.env` out of the tarball was npm falling back to
// `.gitignore`. This asserts the surface instead of assuming it.
const packedFiles = listPackedFiles();

const mustInclude = [
  "package.json",
  "server.js",
  "lib/excalidraw-routes.js",
  "lib/mermaid-sanitize.js",
  "lib/mermaid-diagnostics.js",
  "lib/mermaid-repair.js",
  "lib/model-registry.js",
  "lib/http-middleware.js",
  "lib/openai-client.js",
  "lib/prompt-contracts.js",
  "lib/mermaid-parser.js",
  ".env.example",
  "README.md",
  "INSTALL.md",
  "LICENSE",
  // The two docs a consumer of the proxy needs: what the model may emit, and
  // the request and response shapes.
  "docs/AI_CONTRACT.md",
  "docs/EXAMPLES.md",
];

for (const file of mustInclude) {
  test(`published package contains ${file}`, () => {
    assert.ok(
      packedFiles.includes(file),
      `${file} is missing from the package. Packed: ${packedFiles.join(", ")}`,
    );
  });
}

test("published package never contains the local .env", () => {
  assert.equal(packedFiles.includes(".env"), false);
  assert.equal(
    packedFiles.some((file) => file === ".env" || file.endsWith("/.env")),
    false,
  );
});

test("published package excludes tests and development material", () => {
  const excludedPrefixes = ["test/", ".github/", ".claude/", "node_modules/"];
  // ROADMAP and the editable repo diagram are material for developing the
  // proxy, not for using it.
  const excludedFiles = [
    "CLAUDE.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "docs/ROADMAP.md",
    "docs/repo-diagram.md",
    "docs/repo-diagram.excalidraw",
  ];

  for (const prefix of excludedPrefixes) {
    const leaked = packedFiles.filter((file) => file.startsWith(prefix));
    assert.deepEqual(leaked, [], `${prefix} must not be published`);
  }

  for (const file of excludedFiles) {
    assert.equal(packedFiles.includes(file), false, `${file} must not be published`);
  }
});

// A doc that ships must not link to a file that does not. Trimming the package
// is what creates this failure mode: the link still works on GitHub, so nothing
// but this test notices that it dangles inside the tarball.
test("shipped documentation has no relative link to an unshipped file", () => {
  const dangling = [];

  for (const file of packedFiles.filter((name) => name.endsWith(".md"))) {
    const directory = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
    const body = readFileSync(file, "utf8");

    for (const [, target] of body.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) {
        continue;
      }

      const resolved = normalize(directory + target.split("#")[0]);
      if (resolved && !packedFiles.includes(resolved)) {
        dangling.push(`${file} -> ${target}`);
      }
    }
  }

  assert.deepEqual(dangling, [], "link to repo-only material must use an absolute URL");
});

// Resolves "docs/" + "../LICENSE" and "docs/" + "AI_CONTRACT.md" against the
// package root, which is all the depth this repo's docs need.
function normalize(path) {
  const parts = [];
  for (const segment of path.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

function listPackedFiles() {
  // `npm pack --dry-run` writes no tarball; the JSON report goes to stdout and
  // the human-readable notices to stderr.
  const report = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return JSON.parse(report)[0].files.map((entry) => entry.path);
}
