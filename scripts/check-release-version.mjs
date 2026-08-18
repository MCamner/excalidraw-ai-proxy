// A release publishes whatever version package.json happens to hold. Without
// this check the two can disagree in both directions: a release cut without a
// version bump fails late inside `npm publish` with a 409, and a bumped
// package.json tagged with the wrong name publishes under a version nobody
// released. Run it before tagging, and in CI before publishing.
import { readFileSync } from "node:fs";

const reference = process.argv[2] || "";
const tagVersion = reference.replace(/^refs\/tags\//, "").replace(/^v/, "").trim();
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

if (!tagVersion) {
  console.error("No release tag given. Usage: node scripts/check-release-version.mjs v1.2.3");
  process.exit(1);
}

if (tagVersion !== packageVersion) {
  console.error(
    `Release tag and package.json disagree: tag says ${tagVersion}, package.json says ${packageVersion}.`,
  );
  console.error("Bump package.json to match the tag, or retag, before publishing.");
  process.exit(1);
}

console.log(`Release tag ${reference} matches package.json ${packageVersion}.`);
