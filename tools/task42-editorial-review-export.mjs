import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const evaluationPath = new URL("../reports/task42-prep/task42-recovered-canonical-evaluation.json", import.meta.url);
const ledgerPath = new URL("../reports/task42-prep/task42-acquisition-ledger.json", import.meta.url);
const outputDir = new URL("../reports/task42-prep/task42-editorial-review/", import.meta.url);

const evaluation = JSON.parse(await readFile(evaluationPath, "utf8"));
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const articleByKey = new Map();
for (const source of ledger.records || []) {
  for (const article of source.articles || []) {
    const key = `${source.source_id}|${article.title || ""}|${article.newsLink || ""}`;
    articleByKey.set(key, { source, article });
  }
}

const reviewRecords = (evaluation.records || [])
  .filter((record) => record.decision === "WOULD_PUBLISH" || record.decision === "REVIEW")
  .sort((a, b) => `${a.decision}|${a.source_id}|${a.title}|${a.newsLink}`.localeCompare(`${b.decision}|${b.source_id}|${b.title}|${b.newsLink}`));

const rows = reviewRecords.map((record, index) => {
  const match = articleByKey.get(`${record.source_id}|${record.title || ""}|${record.newsLink || ""}`) || {};
  const source = match.source || {};
  const article = match.article || {};
  const finalState = record.decision === "WOULD_PUBLISH" ? "WOULD_PUBLISH" : "REVIEW";
  return {
    RECORD_ID: `task42-${String(index + 1).padStart(4, "0")}`,
    SOURCE: source.source_url || record.source_url || "",
    TITLE: record.title || article.title || "",
    URL: record.newsLink || article.newsLink || "",
    PUBLISHED_DATE: record.publishedAt || article.publishedAt || "",
    DESCRIPTION: article.description || "",
    EXTRACTED_TEXT_SNIPPET: (article.articleText || "").replace(/\s+/g, " ").trim().slice(0, 1200),
    CURRENT_RELEVANCE_RESULT: record.relevant ? "PASS" : "FAIL",
    CURRENT_NEGATIVE_RESULT: record.negativeSafe ? "PASS" : "FAIL",
    CURRENT_GEO_RESULT: record.geoValid ? "PASS" : "FAIL",
    CURRENT_CITY: record.cityCode || "",
    CURRENT_FINAL_STATE: finalState,
    TASK16_TRIAGE: finalState === "WOULD_PUBLISH" ? "VALID_POSITIVE_CANDIDATE" : "UNCERTAIN",
    TRIAGE_REASON: (record.reasons || []).join("; "),
    HUMAN_LABEL: "",
    HUMAN_CITY: "",
    HUMAN_REASON: "",
    HUMAN_NOTES: ""
  };
});

const columns = [
  "RECORD_ID", "SOURCE", "TITLE", "URL", "PUBLISHED_DATE", "DESCRIPTION",
  "EXTRACTED_TEXT_SNIPPET", "CURRENT_RELEVANCE_RESULT", "CURRENT_NEGATIVE_RESULT",
  "CURRENT_GEO_RESULT", "CURRENT_CITY", "CURRENT_FINAL_STATE", "TASK16_TRIAGE",
  "TRIAGE_REASON", "HUMAN_LABEL", "HUMAN_CITY", "HUMAN_REASON", "HUMAN_NOTES"
];
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";

const htmlEscape = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const cards = rows.map((row) => `<article class="card"><h2>${htmlEscape(row.TITLE)}</h2><p><b>${htmlEscape(row.CURRENT_FINAL_STATE)}</b> · ${htmlEscape(row.CURRENT_CITY)} · ${htmlEscape(row.PUBLISHED_DATE)}</p><p><a href="${htmlEscape(row.URL)}">Source article</a> · ${htmlEscape(row.SOURCE)}</p><dl>${[
  ["Description", row.DESCRIPTION],
  ["Extracted text", row.EXTRACTED_TEXT_SNIPPET],
  ["Relevance", row.CURRENT_RELEVANCE_RESULT],
  ["Negative safety", row.CURRENT_NEGATIVE_RESULT],
  ["Geo", row.CURRENT_GEO_RESULT],
  ["Triage", row.TRIAGE_REASON]
].map(([label, value]) => `<dt>${htmlEscape(label)}</dt><dd>${htmlEscape(value)}</dd>`).join("")}</dl><label>HUMAN_LABEL <input data-field="HUMAN_LABEL"></label><label>HUMAN_CITY <input data-field="HUMAN_CITY"></label><label>HUMAN_REASON <input data-field="HUMAN_REASON"></label><label>HUMAN_NOTES <textarea data-field="HUMAN_NOTES"></textarea></label></article>`).join("\n");
const html = `<!doctype html><meta charset="utf-8"><title>Task 42 editorial review</title><style>body{font:14px system-ui;max-width:1100px;margin:24px auto;background:#f6f7f9;color:#18202a}.card{background:#fff;border:1px solid #d8dee6;border-radius:6px;padding:16px;margin:12px 0}.card h2{font-size:18px}.card p{color:#495565}dl{display:grid;grid-template-columns:150px 1fr;gap:6px}dt{font-weight:700}dd{margin:0;white-space:pre-wrap}input,textarea{display:block;width:100%;box-sizing:border-box;margin:4px 0 10px;padding:7px}a{color:#075fc4}</style><h1>Task 42 editorial review</h1><p>${rows.length} records: ${rows.filter((row) => row.CURRENT_FINAL_STATE === "WOULD_PUBLISH").length} WOULD_PUBLISH and ${rows.filter((row) => row.CURRENT_FINAL_STATE === "REVIEW").length} REVIEW. Human fields are intentionally blank.</p>${cards}`;

await mkdir(outputDir, { recursive: true });
await writeFile(new URL("editorial-review.csv", outputDir), csv);
await writeFile(new URL("editorial-review.html", outputDir), html);
console.log(JSON.stringify({ rows: rows.length, wouldPublish: rows.filter((row) => row.CURRENT_FINAL_STATE === "WOULD_PUBLISH").length, review: rows.filter((row) => row.CURRENT_FINAL_STATE === "REVIEW").length, csv: "reports/task42-prep/task42-editorial-review/editorial-review.csv", html: "reports/task42-prep/task42-editorial-review/editorial-review.html" }, null, 2));
