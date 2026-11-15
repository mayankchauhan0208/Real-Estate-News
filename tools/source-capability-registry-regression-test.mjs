import assert from "node:assert/strict";
import { buildSourceCapabilityRegistry, getNormalRuntimeUrls } from "./source-capability-registry.mjs";

const registry = buildSourceCapabilityRegistry({
  settings: {
    manualSources: [
      { id: "rera", url: "https://example.test/rera/press-release", label: "Example RERA Press Release", category: "manual", cityCodes: ["noida"] },
      { id: "hindi", url: "https://example.test/hindi/rss.xml", label: "Hindi Desk", category: "regional-hindi-rss", cityCodes: ["noida"] }
    ]
  },
  runtimeUrls: ["https://example.test/hindi/rss.xml"],
  cityRules: []
});

assert.equal(registry.rows.length, 2);
const authority = registry.rows.find((row) => row.sourceIds.includes("rera"));
const hindi = registry.rows.find((row) => row.sourceIds.includes("hindi"));
assert.equal(authority.sourceType, "OFFICIAL_AUTHORITY");
assert.equal(authority.activeInRuntime, false);
assert.equal(authority.latestReachability, "UNVERIFIED");
assert.match(authority.extractionPath, /PDF\/OCR/);
assert.equal(hindi.language, "HINDI");
assert.equal(hindi.sourceType, "REGIONAL_NEWS");
assert.equal(hindi.activeInRuntime, true);
assert.match(hindi.extractionPath, /^RSS_OR_ATOM/);
assert.equal(registry.summary.languages.HINDI.configured, 1);
assert.ok(getNormalRuntimeUrls().length > 0, "normal runtime inventory must model a non-empty production source universe");
console.log("SOURCE_CAPABILITY_REGISTRY_REGRESSION=PASS");
