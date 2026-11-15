import assert from "node:assert/strict";
import { buildCityCoverageIntelligence } from "./city-coverage-intelligence.mjs";

const registry = { rows: [
  { url: "https://example.test/noida", activeInRuntime: true, cityCodes: ["noida"], language: "HINDI", sourceType: "REGIONAL_NEWS" },
  { url: "https://example.test/official", activeInRuntime: true, cityCodes: ["noida"], language: "ENGLISH_OR_UNVERIFIED", sourceType: "OFFICIAL_AUTHORITY" }
] };
const report = buildCityCoverageIntelligence({
  registry,
  cities: [{ code: "noida", name: "Noida", state: "Uttar Pradesh" }, { code: "missing", name: "Missing", state: "Test" }],
  probeRows: [{ url: "https://example.test/noida", status: "SUCCESS", fullArticlesReadable: 1, generatedAt: "2026-11-14T00:00:00.000Z" }]
});
const noida = report.rows.find((row) => row.cityCode === "noida");
const missing = report.rows.find((row) => row.cityCode === "missing");
assert.equal(noida.status, "SINGLE_RUNTIME_PROVEN_SOURCE");
assert.equal(noida.nativeLanguageSources, 1);
assert.equal(noida.officialSources, 1);
assert.equal(noida.cityFocusedSources, 2);
assert.equal(missing.status, "NO_ACTIVE_ASSIGNED_SOURCE");
console.log("CITY_COVERAGE_INTELLIGENCE_REGRESSION=PASS");
