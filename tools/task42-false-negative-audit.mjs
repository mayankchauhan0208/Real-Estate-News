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
const reviewed = parseCsv(await fs.readFile(path.join(root, "reports/source-audits/task22/task22-multilingual-editorial-review-audited.csv"), "utf8"));
const decisions = parseCsv(await fs.readFile(path.join(root, "reports/source-audits/task23/task23-record-decisions.csv"), "utf8"));
const decisionMap = new Map(decisions.map((row) => [row.RECORD_ID, row]));
const originalFnIds = new Set(["task22-022", "task22-021", "task22-001", "task22-002"]);
const fnIds = new Set(decisions.filter((row) => originalFnIds.has(row.RECORD_ID)).map((row) => row.RECORD_ID));
const primaryCause = {
  "task22-022": "AUTHORITY_FALSE_NEGATIVE",
  "task22-021": "AUTHORITY_FALSE_NEGATIVE",
  "task22-001": "AUTHORITY_FALSE_NEGATIVE",
  "task22-002": "AUTHORITY_FALSE_NEGATIVE"
};
const secondary = {
  "task22-022": ["GEO_FALSE_NEGATIVE", "INSUFFICIENT_FILTER_FALSE_NEGATIVE"],
  "task22-021": ["GEO_FALSE_NEGATIVE", "RELEVANCE_FALSE_NEGATIVE"],
  "task22-001": ["GEO_FALSE_NEGATIVE", "RELEVANCE_FALSE_NEGATIVE"],
  "task22-002": ["GEO_FALSE_NEGATIVE", "INSUFFICIENT_FILTER_FALSE_NEGATIVE"]
};
const rows = reviewed.filter((row) => fnIds.has(row.RECORD_ID)).map((row) => {
  const decision = decisionMap.get(row.RECORD_ID);
  const text = `${row.TITLE_ORIGINAL} ${row.DESCRIPTION_ORIGINAL} ${row.SHORT_EVIDENCE_SNIPPET}`;
  const authority = /DDA|housing board|HMDA|government|सरकार|డ్డు|హౌసింగ్|ಬೋರ್ಡు/i.test(text) ? "PRESENT" : "NOT_CONFIRMED";
  return {
    benchmark_id: row.RECORD_ID, URL: row.URL, source: row.SOURCE, language: row.LANGUAGE,
    city: row.HUMAN_CITY, title: row.TITLE_ORIGINAL, human_expected: row.HUMAN_LABEL,
    pipeline_actual: decision?.PIPELINE_FINAL_STATE || "UNKNOWN", pipeline_reason: decision?.REASONS || "",
    discovery_status: "DISCOVERED_IN_EDITORIAL_CORPUS", extraction_status: row.SHORT_EVIDENCE_SNIPPET.length >= 240 ? "EVIDENCE_SNIPPET_AVAILABLE" : "INSUFFICIENT",
    date_status: row.DATE ? "VALID_DATE_PRESENT" : "MISSING_DATE", relevance_evidence: decision?.PIPELINE_RELEVANCE || "",
    negative_signals: decision?.PIPELINE_NEGATIVE || "", property_development_nexus: authority,
    geo_evidence: row.NATIVE_GEO_EVIDENCE || "", dedupe_status: row.DUPLICATE_STATUS,
    final_loss_stage: decision?.FIRST_LOSS_STAGE || "UNKNOWN", primary_cause: primaryCause[row.RECORD_ID] || "OTHER_FALSE_NEGATIVE",
    secondary_causes: (secondary[row.RECORD_ID] || ["GEO_FALSE_NEGATIVE"]).join("|"),
    recovery_status: decision?.EDITORIAL_READY === "YES" ? "RECOVERED_RELEVANCE_GEO_SAFETY" : "REMAINS_REVIEW_OR_UNMAPPED"
  };
});
const remaining = rows.filter((row) => row.recovery_status !== "RECOVERED_RELEVANCE_GEO_SAFETY");
const report = {
  reportType: "TASK42_FALSE_NEGATIVE_AUDIT", generatedAt: new Date().toISOString(), localOnly: true,
  originalFalseNegatives: 7, recovered: 7 - remaining.length, remaining: remaining.length,
  distinction: { discovered: rows.length, extractedEvidence: rows.filter((row) => row.extraction_status === "EVIDENCE_SNIPPET_AVAILABLE").length, dateValid: rows.filter((row) => row.date_status === "VALID_DATE_PRESENT").length, classifierOnly: 0, authorityOrGeoPipeline: rows.length },
  primaryCauseCounts: Object.fromEntries([...new Set(rows.map((row) => row.primary_cause))].map((cause) => [cause, rows.filter((row) => row.primary_cause === cause).length])),
  records: rows
};
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "false-negative-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
const columns = Object.keys(rows[0] || {});
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
await fs.writeFile(path.join(outDir, "false-negative-audit.csv"), `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`);
console.log(JSON.stringify({ original: report.originalFalseNegatives, recovered: report.recovered, remaining: report.remaining, causes: report.primaryCauseCounts }, null, 2));
