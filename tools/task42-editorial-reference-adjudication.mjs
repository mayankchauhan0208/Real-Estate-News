import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const evaluation = JSON.parse(await readFile(path.join(root, "reports/task42-prep/task42-recovered-canonical-evaluation.json"), "utf8"));
const ledger = JSON.parse(await readFile(path.join(root, "reports/task42-prep/task42-acquisition-ledger.json"), "utf8"));
const frozenReference = JSON.parse(execFileSync("git", ["show", "d77b779:reports/task42-prep/task42-editorial-reference/editorial-reference.json"], { encoding: "utf8" }));
const articleByKey = new Map();
for (const source of ledger.records || []) {
  for (const article of source.articles || []) {
    articleByKey.set(`${source.source_id}|${article.title || ""}|${article.newsLink || ""}`, { source, article });
  }
}

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const textOf = (article) => clean([article.title, article.description, article.articleText].join(" ")).toLowerCase();
const eventClass = (text) => {
  const classes = [
    ["RERA/REGULATORY", /rera|regulatory authority|carpet area|compliance/],
    ["LEGAL/INSOLVENCY", /nclat|nclt|insolvency|tribunal|court|judgment/],
    ["TRANSACTION", /bought|purchase|acquire|acquisition|sale|sold|lease|leased|rental/],
    ["LAUNCH/PROJECT", /launch|launched|project|phase|residential development|commercial development/],
    ["INFRASTRUCTURE", /metro|expressway|airport|road|corridor|station development|land acquisition/],
    ["INVESTMENT/BUSINESS", /investment|sales target|pipeline|portfolio|fund|revenue/]
  ];
  return classes.find(([, pattern]) => pattern.test(text))?.[0] || "OTHER";
};

function adjudicate(record, article) {
  const reasons = record.reasons || [];
  const text = textOf(article);
  const hasNegative = reasons.some((reason) => /negative|crime|utility concern|adverse/i.test(reason));
  const hasOffTopic = reasons.some((reason) => /not positive target|off-topic|spam\/menu|unsupported language/i.test(reason));
  const hasInsufficientEvidence = !article.fullArticleRead || !record.dateValid || !record.geoValid || !record.contentValid;
  const ambiguousGeo = reasons.some((reason) => /ambiguous multi-city/i.test(reason));
  const positiveSignals = /project|development|housing|residential|commercial|property|real estate|realty|rera|land acquisition|station development|home/i.test(text);
  const publishableEvidence = record.relevant && record.negativeSafe && record.propertyNexus && record.geoValid && record.fresh && article.fullArticleRead === true && positiveSignals;

  if (hasNegative) return { decision: "REJECT_NEGATIVE", reason: "Adverse, enforcement, dispute or negative safety signal is present.", confidence: "HIGH" };
  if (hasOffTopic) return { decision: "REJECT_OFFTOPIC", reason: "Evidence does not establish Brokket-suitable positive real-estate coverage.", confidence: "HIGH" };
  if (ambiguousGeo) return { decision: "REVIEW", reason: "Full article names multiple markets without a city-scoped title or URL.", confidence: "HIGH" };
  if (record.decision === "WOULD_PUBLISH" && publishableEvidence) return { decision: "PUBLISH", reason: "Full article supports a positive real-estate/development event with current date, property nexus and routed city.", confidence: "HIGH" };
  if (publishableEvidence && reasons.every((reason) => /^review:/i.test(reason))) return { decision: "PUBLISH", reason: "Review was caused by evidence-policy uncertainty, but full article evidence supports publication.", confidence: "MEDIUM" };
  if (hasInsufficientEvidence) return { decision: "REJECT_INSUFFICIENT", reason: "Required full-article, date, content or geo evidence is incomplete.", confidence: "HIGH" };
  return { decision: "REVIEW", reason: "Editorial judgment remains necessary after canonical gates.", confidence: "MEDIUM" };
}

const rows = (evaluation.records || [])
  .sort((a, b) => `${a.source_id}|${a.title}|${a.newsLink}`.localeCompare(`${b.source_id}|${b.title}|${b.newsLink}`));
const currentByKey = new Map(rows.map((record) => [`${record.source_id}|${record.title || ""}|${record.newsLink || ""}`, record]));
const currentByTitleUrl = new Map(rows.map((record) => [`${record.title || ""}|${record.newsLink || ""}`, record]));
const referenceRows = frozenReference.rows.map((reference, index) => {
    const record = currentByKey.get(`${reference.source_id || ""}|${reference.title || ""}|${reference.url || reference.newsLink || ""}`) || currentByTitleUrl.get(`${reference.title || ""}|${reference.url || reference.newsLink || ""}`) || {};
    const match = articleByKey.get(`${record.source_id}|${record.title || ""}|${record.newsLink || ""}`) || {};
    const article = match.article || {};
    return {
      ...reference,
      record_id: reference.record_id || `task42-ref-${String(index + 1).padStart(4, "0")}`,
      original_engine_decision: reference.original_engine_decision || reference.CURRENT_FINAL_STATE || "REVIEW",
      post_fix_engine_decision: record.decision || "UNKNOWN",
      post_fix_reasons: (record.reasons || []).join("; "),
      source: reference.source || match.source?.source_url || record.source_url || "",
      title: reference.title || record.title || "",
      url: reference.url || record.newsLink || "",
      published_date: reference.published_date || record.publishedAt || article.publishedAt || "",
      editorial_reference_city: reference.editorial_reference_city || record.cityCode || "",
      editorial_reference_event_class: reference.editorial_reference_event_class || eventClass(textOf(article)),
      editorial_reference_property_nexus: reference.editorial_reference_property_nexus || (record.propertyNexus ? "YES" : "NO")
    };
  });

const distribution = referenceRows.reduce((counts, row) => { counts[row.editorial_reference_decision] = (counts[row.editorial_reference_decision] || 0) + 1; return counts; }, {});
const originalReviewBreakdown = referenceRows.filter((row) => row.original_engine_decision === "REVIEW").reduce((counts, row) => { const key = row.editorial_reference_decision === "PUBLISH" ? "SHOULD_PUBLISH" : row.editorial_reference_decision === "REJECT_NEGATIVE" ? "SHOULD_REJECT_NEGATIVE" : row.editorial_reference_decision === "REJECT_OFFTOPIC" ? "SHOULD_REJECT_OFFTOPIC" : row.editorial_reference_decision === "REJECT_INSUFFICIENT" ? "SHOULD_REJECT_INSUFFICIENT" : "CORRECT_REVIEW"; counts[key] = (counts[key] || 0) + 1; return counts; }, {});
const postFixDistribution = referenceRows.reduce((counts, row) => { counts[row.post_fix_engine_decision] = (counts[row.post_fix_engine_decision] || 0) + 1; return counts; }, {});
const report = { generatedAt: new Date().toISOString(), corpus: referenceRows.length, distribution, originalReviewBreakdown, postFixDistribution, note: "Frozen Codex editorial-reference adjudication compared with the corrected canonical engine. These are not independent human labels and must not be used as measured precision or recall." };
const outDir = path.join(root, "reports/task42-prep/task42-editorial-reference");
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "editorial-reference.json"), `${JSON.stringify({ report, rows: referenceRows }, null, 2)}\n`);
const columns = Object.keys(referenceRows[0] || {});
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
await writeFile(path.join(outDir, "editorial-reference.csv"), `${columns.join(",")}\n${referenceRows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`);
console.log(JSON.stringify(report, null, 2));
