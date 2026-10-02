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
  const current = task20.get(row.RECORD_ID); const expected = cityCode(row.HUMAN_CITY); const actual = String(current?.TASK20_GEO || "").split("|").filter(Boolean);
  return { benchmark_id: row.RECORD_ID, expected: expected ? `CITY:${expected}` : "REVIEW_GEO", actual: actual.length > 1 ? `MULTI_CITY:${actual.join("|")}` : actual.length === 1 ? `CITY:${actual[0]}` : "NO_CITY", human_label: row.HUMAN_LABEL, city_evidence: row.HUMAN_CITY, source: row.SOURCE };
}), ...task22.map((row) => {
  const current = task23.get(row.RECORD_ID); const expected = cityCode(row.HUMAN_CITY); const actual = String(current?.PIPELINE_GEO || "").split("|").filter(Boolean);
  return { benchmark_id: row.RECORD_ID, expected: expected ? `CITY:${expected}` : "REVIEW_GEO", actual: actual.length > 1 ? `MULTI_CITY:${actual.join("|")}` : actual.length === 1 ? `CITY:${actual[0]}` : "NO_CITY", human_label: row.HUMAN_LABEL, city_evidence: row.HUMAN_CITY, source: row.SOURCE };
})];
const classified = records.map((row) => ({ ...row, outcome: row.expected === "REVIEW_GEO" ? (row.actual === "NO_CITY" ? "CORRECT_REVIEW" : "OVER_ROUTED_CITY") : row.actual === row.expected ? "CORRECT_CITY" : row.actual === "NO_CITY" ? "MISSED_CITY" : row.actual.startsWith("MULTI_CITY:") && row.actual.split(":")[1].split("|").includes(row.expected.slice(5)) ? "CORRECT_MULTI_CITY" : "WRONG_CITY" }));
const count = (value) => classified.filter((row) => row.outcome === value).length;
const report = { reportType: "TASK42_FORMAL_GEO_BENCHMARK", generatedAt: new Date().toISOString(), localOnly: true, cases: classified.length, counts: { correctCity: count("CORRECT_CITY"), correctMultiCity: count("CORRECT_MULTI_CITY"), correctReview: count("CORRECT_REVIEW"), missed: count("MISSED_CITY"), wrong: count("WRONG_CITY"), overRouted: count("OVER_ROUTED_CITY") }, geoRecall: (() => { const denominator = classified.filter((row) => row.expected.startsWith("CITY:")).length; const correct = classified.filter((row) => row.expected.startsWith("CITY:") && ["CORRECT_CITY", "CORRECT_MULTI_CITY"].includes(row.outcome)).length; return denominator ? correct / denominator : null; })(), wrongCityGate: count("WRONG_CITY") === 0, overRoutedGate: count("OVER_ROUTED_CITY") === 0, note: "Real human-audited records only; this corpus is 94 cases, below the requested 100-case target.", records: classified };
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "geo-benchmark.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ cases: report.cases, counts: report.counts, geoRecall: report.geoRecall, wrongCityGate: report.wrongCityGate, overRoutedGate: report.overRoutedGate }, null, 2));
