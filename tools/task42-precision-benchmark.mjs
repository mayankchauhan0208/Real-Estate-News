import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "reports/source-audits/task42");
const input = [
  { task: "task17", path: path.join(root, "reports/source-audits/task20/task20-before-after.csv") },
  { task: "task22", path: path.join(root, "reports/source-audits/task22/task22-multilingual-editorial-review-audited.csv") }
];

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ""; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""])));
}

const task17Rows = parseCsv(await fs.readFile(input[0].path, "utf8")).map((row) => ({
  task: "task17/20", recordId: row.RECORD_ID, source: row.SOURCE, title: row.TITLE, url: row.URL,
  language: "English/unknown", city: row.HUMAN_CITY, humanLabel: row.HUMAN_LABEL,
  currentOutcome: row.TASK20_WOULD_PUBLISH === "YES" ? "PUBLISH" : "REVIEW_OR_REJECT",
  relevance: row.TASK20_CLASSIFICATION, negative: row.TASK20_NEGATIVE, geo: row.TASK20_GEO,
  duplicate: "UNIQUE_IN_AUDITED_SET", evidenceStatus: "HUMAN_AUDITED"
}));
const task23Decisions = new Map(parseCsv(await fs.readFile(path.join(root, "reports/source-audits/task23/task23-record-decisions.csv"), "utf8")).map((row) => [row.RECORD_ID, row]));
const task22Rows = parseCsv(await fs.readFile(input[1].path, "utf8")).map((row) => {
  const decision = task23Decisions.get(row.RECORD_ID);
  return ({
  task: "task22/23", recordId: row.RECORD_ID, source: row.SOURCE, title: row.TITLE_ORIGINAL, url: row.URL,
  language: row.LANGUAGE, city: row.HUMAN_CITY || row.NORMALIZED_CITY, humanLabel: row.HUMAN_LABEL,
  currentOutcome: decision?.EDITORIAL_READY === "YES" ? "PUBLISH" : "REVIEW_OR_REJECT",
  relevance: decision?.PIPELINE_RELEVANCE || row.PIPELINE_RELEVANCE, negative: decision?.PIPELINE_NEGATIVE || row.PIPELINE_NEGATIVE, geo: decision?.PIPELINE_GEO || row.PIPELINE_GEO,
  duplicate: row.DUPLICATE_STATUS, evidenceStatus: "HUMAN_AUDITED"
  });
});
const records = [...task17Rows, ...task22Rows];
if (new Set(records.map((row) => row.recordId)).size !== records.length) throw new Error("Precision corpus contains duplicate record IDs");
if (records.some((row) => !row.humanLabel)) throw new Error("Precision corpus contains an unlabeled row");
const published = records.filter((row) => row.humanLabel === "PUBLISH");
const nonPublished = records.filter((row) => row.humanLabel !== "PUBLISH");
const predicted = records.filter((row) => row.currentOutcome === "PUBLISH");
const tp = predicted.filter((row) => row.humanLabel === "PUBLISH").length;
const fp = predicted.filter((row) => row.humanLabel !== "PUBLISH").length;
const fn = published.length - tp;
const tn = nonPublished.length - fp;
const div = (a, b) => b ? a / b : null;
const report = {
  reportType: "TASK42_REAL_WORLD_PRECISION_BENCHMARK",
  generatedAt: new Date().toISOString(), localOnly: true, productionMutations: 0,
  provenance: ["reports/source-audits/task20/task20-before-after.csv", "reports/source-audits/task22/task22-multilingual-editorial-review-audited.csv"],
  note: "Existing human-audited real records merged without adding synthetic cases or treating machine triage as truth. This is a measured 94-record baseline, not the requested 100-case target.",
  corpusSize: records.length, uniqueRecordIds: new Set(records.map((row) => row.recordId)).size,
  humanLabels: Object.fromEntries(["PUBLISH", "REJECT_NEGATIVE", "REJECT_OFF_TOPIC", "REJECT_INSUFFICIENT", "REVIEW_UNCERTAIN"].map((label) => [label, records.filter((row) => row.humanLabel === label).length])),
  confusion: { TP: tp, FP: fp, TN: tn, FN: fn, precision: div(tp, tp + fp), recall: div(tp, tp + fn), falsePositiveRate: div(fp, fp + tn), falseNegativeRate: div(fn, fn + tp) },
  hardGates: { falsePositive: fp === 0, wrongCity: "UNMEASURED_FROM_THIS_CORPUS" },
  languageCounts: Object.fromEntries([...new Set(records.map((row) => row.language))].sort().map((language) => [language, records.filter((row) => row.language === language).length])),
  records
};
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "precision-benchmark.json"), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "precision-benchmark.csv"), [
  Object.keys(records[0]).join(","),
  ...records.map((row) => Object.values(row).map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
].join("\n") + "\n");
console.log(JSON.stringify({ corpusSize: report.corpusSize, confusion: report.confusion, hardGates: report.hardGates }, null, 2));
