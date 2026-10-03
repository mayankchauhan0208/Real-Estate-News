import fs from "node:fs/promises";
import path from "node:path";
import { workbookCityRules } from "../src/city-config.js";

const root = process.cwd();
const rows = JSON.parse(await fs.readFile(path.join(root, "reports/source-audits/task28/task28-monitor-rows.json"), "utf8"));
const cities = workbookCityRules.map((city) => {
  const assigned = rows.filter((row) => String(row.configured_cities || "").split("|").includes(city.code));
  const successful = assigned.filter((row) => row.transport === "SUCCESS");
  const readable = assigned.filter((row) => row.readable_articles > 0);
  const current = assigned.filter((row) => row.current_articles > 0);
  const candidates = assigned.filter((row) => row.unique_candidates > 0 && String(row.city_code || "") === city.code);
  let classification = "UNVERIFIED";
  if (candidates.length) classification = "VERIFIED_CAPTURED";
  else if (assigned.length && successful.length === 0) classification = "FETCH_GAP";
  else if (assigned.length && successful.length && readable.length === 0) classification = "EXTRACTION_GAP";
  else if (assigned.length && successful.length && current.length === 0) classification = "VERIFIED_NO_CURRENT_SUPPLY";
  else if (assigned.length && current.length && candidates.length === 0 && assigned.some((row) => row.geo_valid_articles === 0)) classification = "GEO_GAP";
  else if (assigned.length && successful.length) classification = "MULTIPLE_GAPS";
  return {
    city: city.code,
    state: city.state,
    assigned_sources: assigned.length,
    successful_sources: successful.length,
    readable_sources: readable.length,
    current_sources: current.length,
    captured_sources: candidates.length,
    timeout_sources: assigned.filter((row) => row.transport === "TIMEOUT").length,
    failed_sources: assigned.filter((row) => row.transport === "FAILED").length,
    classification
  };
});

const counts = Object.fromEntries(Object.entries(cities.reduce((acc, row) => {
  acc[row.classification] = (acc[row.classification] || 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1]));
const output = { generatedAt: new Date().toISOString(), sourceAudit: "task28-monitor-rows.json", cityCount: cities.length, classifications: counts, cities };
const outDir = path.join(root, "reports/task42-prep");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "task42-city-coverage-current.json"), `${JSON.stringify(output, null, 2)}\n`);
const headers = Object.keys(cities[0]);
await fs.writeFile(path.join(outDir, "task42-city-coverage-current.csv"), [headers.join(","), ...cities.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n") + "\n");
console.log(JSON.stringify({ cityCount: cities.length, classifications: counts }, null, 2));
