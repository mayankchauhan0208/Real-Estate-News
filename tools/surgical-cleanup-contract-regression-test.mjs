import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [cleanupSource, workflow] = await Promise.all([
  fs.readFile(new URL("./surgical-false-positive-cleanup.mjs", import.meta.url), "utf8"),
  fs.readFile(new URL("../.github/workflows/surgical-false-positive-cleanup.yml", import.meta.url), "utf8")
]);

assert.match(cleanupSource, /if \(execute && !apiKey\)/, "mutation must require an API credential");
assert.match(cleanupSource, /const matches = listAttempted && !listError \? exactMatches\(before, target\) : \[\];/, "failed reads must never fabricate cleanup matches");
assert.doesNotMatch(cleanupSource, /id: target\.articleId/, "static target fallback must not be usable as a production record");
assert.match(cleanupSource, /if \(execute && !credentialError && !listError\)/, "claim-store setup must follow successful production-read preconditions");
assert.match(cleanupSource, /if \(execute && store && matches\.length === 1/, "mutation must require a configured claim store");
assert.match(cleanupSource, /if \(execute && \(/, "mutation failures must fail the workflow");
assert.match(workflow, /Verify cleanup credentials before mutation/, "workflow must preflight mutation credentials");
assert.match(workflow, /if: \$\{\{ inputs\.execute == true \}\}/, "credential preflight must apply only to mutating invocations");

console.log("SURGICAL_CLEANUP_CONTRACT_REGRESSION=PASS");
