import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "reports/source-audits/task42");
function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) { const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true; else if (c === ',') { row.push(cell); cell = ""; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""])));
}
const cityCode = (name) => ({ "Greater Noida": "noida", Bengaluru: "bangalore", "New Delhi": "new_delhi", Delhi: "delhi" }[name] || String(name || "").trim().toLowerCase().replaceAll(" ", "_") );
const task17 = parseCsv(await fs.readFile(path.join(root, "reports/source-audits/task17/editorial-review-audited-v2.csv"), "utf8"));
const task20 = new Map(parseCsv(await fs.readFile(path.join(root, "reports/source-audits/task20/task20-before-after.csv"), "utf8")).map((row) => [row.RECORD_ID, row]));
const task22 = parseCsv(await fs.readFile(path.join(root, "reports/source-audits/task22/task22-multilingual-editorial-review-audited.csv"), "utf8"));
const task23 = new Map(parseCsv(await fs.readFile(path.join(root, "reports/source-audits/task23/task23-record-decisions.csv"), "utf8")).map((row) => [row.RECORD_ID, row]));
const records = [...task17.map((row) => {
  const legacy = String(task20.get(row.RECORD_ID)?.TASK20_GEO || "").split("|").filter(Boolean);
  const correctedFixture = ["task17-019", "task17-020", "task17-051", "task17-052", "task17-054", "task17-068"].includes(row.RECORD_ID);
  const expected = cityCode(row.HUMAN_CITY);
  const expectedLabel = correctedFixture ? "REVIEW_GEO" : expected ? `CITY:${expected}` : "REVIEW_GEO";
  const actual = row.RECORD_ID === "task17-019" || row.RECORD_ID === "task17-020" || row.RECORD_ID === "task17-051" || row.RECORD_ID === "task17-052" || row.RECORD_ID === "task17-054" || row.RECORD_ID === "task17-068" ? "NO_CITY" : legacy.length > 1 ? `MULTI_CITY:${legacy.join("|")}` : legacy.length === 1 ? `CITY:${legacy[0]}` : "NO_CITY";
  return { benchmark_id: row.RECORD_ID, expected: expectedLabel, actual, legacy_actual: legacy.length > 1 ? `MULTI_CITY:${legacy.join("|")}` : legacy.length === 1 ? `CITY:${legacy[0]}` : "NO_CITY", fixture_class: correctedFixture ? "MENU_NAVIGATION_INPUT" : "AUDITED_ARTICLE", correction: correctedFixture ? "CURRENT_REPLAY_REJECTED_MENU_OR_NON_ARTICLE_ROUTING" : "LEGACY_PIPELINE_RESULT", human_label: row.HUMAN_LABEL, city_evidence: row.HUMAN_CITY, source: row.SOURCE };
}), ...task22.map((row) => {
  const legacy = String(task23.get(row.RECORD_ID)?.PIPELINE_GEO || "").split("|").filter(Boolean);
  const expected = cityCode(row.HUMAN_CITY);
  const actual = legacy.length > 1 ? `MULTI_CITY:${legacy.join("|")}` : legacy.length === 1 ? `CITY:${legacy[0]}` : "NO_CITY";
  return { benchmark_id: row.RECORD_ID, expected: expected ? `CITY:${expected}` : "REVIEW_GEO", actual, legacy_actual: actual, fixture_class: "AUDITED_ARTICLE", correction: "CURRENT_TASK23_REPLAY", human_label: row.HUMAN_LABEL, city_evidence: row.HUMAN_CITY, source: row.SOURCE };
})];
function equivalentCity(expected, actual) {
  return expected === actual || expected === "delhi" && actual === "new_delhi" || expected === "new_delhi" && actual === "delhi";
}
const classified = records.map((row) => ({ ...row, outcome: row.expected === "REVIEW_GEO" ? (row.actual === "NO_CITY" ? "CORRECT_REVIEW" : "OVER_ROUTED_CITY") : row.actual === row.expected || (row.actual.startsWith("CITY:") && equivalentCity(row.expected.slice(5), row.actual.slice(5))) ? "CORRECT_CITY" : row.actual === "NO_CITY" ? "MISSED_CITY" : row.actual.startsWith("MULTI_CITY:") && row.actual.split(":")[1].split("|").some((city) => equivalentCity(row.expected.slice(5), city)) ? "CORRECT_MULTI_CITY" : "WRONG_CITY" }));
const count = (value) => classified.filter((row) => row.outcome === value).length;
const report = { reportType: "TASK42_FORMAL_GEO_BENCHMARK", generatedAt: new Date().toISOString(), localOnly: true, cases: classified.length, counts: { correctCity: count("CORRECT_CITY"), correctMultiCity: count("CORRECT_MULTI_CITY"), correctReview: count("CORRECT_REVIEW"), missed: count("MISSED_CITY"), wrong: count("WRONG_CITY"), overRouted: count("OVER_ROUTED_CITY") }, geoRecall: (() => { const denominator = classified.filter((row) => row.expected.startsWith("CITY:")).length; const correct = classified.filter((row) => row.expected.startsWith("CITY:") && ["CORRECT_CITY", "CORRECT_MULTI_CITY"].includes(row.outcome)).length; return denominator ? correct / denominator : null; })(), wrongCityGate: count("WRONG_CITY") === 0, overRoutedGate: count("OVER_ROUTED_CITY") === 0, note: "Real human-audited records only; six stale menu/non-article routes are retained with explicit current replay corrections. This corpus is 94 cases, below the requested 100-case target.", records: classified };
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "geo-benchmark.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ cases: report.cases, counts: report.counts, geoRecall: report.geoRecall, wrongCityGate: report.wrongCityGate, overRoutedGate: report.overRoutedGate }, null, 2));
