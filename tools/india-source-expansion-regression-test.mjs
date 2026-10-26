import fs from "node:fs";
import assert from "node:assert/strict";

const settings = JSON.parse(fs.readFileSync("config/admin-settings.json", "utf8"));
const expected = new Map([
  ["regional-jagran-gurugram", ["gurugram"]],
  ["regional-jagran-lucknow", ["lucknow"]],
  ["regional-jagran-noida", ["noida"]],
  ["regional-jagran-ghaziabad", ["ghaziabad"]],
  ["regional-jagran-kanpur", ["kanpur"]],
  ["regional-jagran-varanasi", ["varanasi"]],
  ["regional-jagran-agra", ["agra"]],
  ["regional-jagran-meerut", ["meerut"]],
  ["regional-jagran-prayagraj", ["allahabad"]]
]);

const sources = settings.manualSources.filter((source) => expected.has(source.id));
assert.equal(sources.length, expected.size, "all verified Jagran city sources must be configured");

for (const source of sources) {
  assert.equal(source.enabled, true, `${source.id} must remain enabled after the clean event-core dry proof`);
  assert.equal(source.category, "regional-hindi", `${source.id} must retain native-language metadata`);
  assert.equal(source.sourceMode, "ACTIVE_FOR_REVIEW", `${source.id} must not bypass editorial safeguards`);
  assert.deepEqual(source.cityCodes, expected.get(source.id), `${source.id} must remain city scoped`);
  assert.match(source.url, /^https:\/\/www\.jagran\.com\/(?:haryana|uttar-pradesh)\//);
}

const ids = settings.manualSources.map((source) => source.id);
const urls = settings.manualSources.map((source) => source.url.replace(/\/+$/, "").toLowerCase());
assert.equal(new Set(ids).size, ids.length, "manual source IDs must be unique");
assert.equal(new Set(urls).size, urls.length, "manual source URLs must be unique");

const anandabazar = settings.manualSources.find((source) => source.id === "regional-anandabazar-real-estate");
assert.ok(anandabazar, "verified Anandabazar Bengali real-estate surface must be configured");
assert.equal(anandabazar.enabled, true);
assert.equal(anandabazar.category, "regional-bengali");
assert.equal(anandabazar.sourceMode, "ACTIVE_FOR_REVIEW", "new regional source must remain review-only");
assert.deepEqual(anandabazar.cityCodes, ["kolkata"]);

delete process.env.ENABLE_EXPERIMENTAL_SOURCES;
const defaultRuntime = (await import("../src/index.js")).getSourceUrls();
assert.equal(defaultRuntime.some((url) => url.includes("jagran.com")), false, "experimental sources must still require explicit runtime opt-in");

process.env.ENABLE_EXPERIMENTAL_SOURCES = "true";
const productionRuntime = (await import(`../src/index.js?production-opt-in=${Date.now()}`)).getSourceUrls();
assert.equal(productionRuntime.filter((url) => url.includes("jagran.com")).length, expected.size, "all verified Jagran surfaces must remain in the production runtime");
assert.equal(productionRuntime.filter((url) => url.includes("anandabazar.com/topic/real-estate")).length, 1, "verified Bengali surface must be selectable with experimental opt-in");

console.log(`India source expansion safety regression passed: ${sources.length} verified Jagran city surfaces are enabled after the clean event-core dry proof.`);
