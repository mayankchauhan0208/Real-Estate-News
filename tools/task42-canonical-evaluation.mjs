import fs from "node:fs/promises";
import path from "node:path";
import {
  applyCityCode,
  articleDedupeIds,
  getRejectionReasons,
  getArticleFinalState,
  isPublishableArticle
} from "../src/index.js";

const root = process.cwd();
const ledger = JSON.parse(await fs.readFile(path.join(root, "reports/task42-prep/task42-acquisition-ledger.json"), "utf8"));
const now = Date.now();
const currentWindowMs = 20 * 86400000;
const seenIds = new Set();
const records = [];
for (const source of ledger.records) {
  for (const acquired of source.articles) {
    const article = applyCityCode(acquired);
    const text = String(article.articleText || article.description || "").trim();
    const publishedMs = Date.parse(article.publishedAt || article.createdAt || "");
    const contentValid = Boolean(article.title && text.length >= 200);
    const dateValid = Number.isFinite(publishedMs);
    const fresh = dateValid && now - publishedMs <= currentWindowMs && publishedMs <= now + 86400000;
    const reasons = getRejectionReasons(article, seenIds);
    const dedupeIds = articleDedupeIds(article);
    const dedupePass = dedupeIds.length > 0 && !dedupeIds.some((id) => seenIds.has(id));
    const geoValid = Boolean(article.cityCode);
    const finalState = getArticleFinalState(article, reasons);
    const review = finalState === "REVIEW";
    const negativeSafe = !reasons.some((reason) => /negative|crime|utility concern|adverse/i.test(reason));
    const propertyNexus = !reasons.some((reason) => /property|development signal|nexus|real-estate\/project news/i.test(reason));
    const canonical = contentValid && fresh && geoValid && dedupePass && isPublishableArticle(article, seenIds);
    if (canonical) for (const id of dedupeIds) seenIds.add(id);
    records.push({ source_id: source.source_id, source_url: source.url, title: article.title, newsLink: article.newsLink, publishedAt: article.publishedAt || article.createdAt || "", cityCode: article.cityCode || "", contentValid, dateValid, fresh, relevant: !reasons.some((reason) => /not positive target|off-topic|relevance/i.test(reason)), negativeSafe, propertyNexus, geoValid, dedupePass, decision: canonical ? "WOULD_PUBLISH" : review ? "REVIEW" : "REJECT", reasons });
  }
}
const count = (field) => records.filter((row) => row[field]).length;
const decisions = records.reduce((acc, row) => (acc[row.decision] = (acc[row.decision] || 0) + 1, acc), {});
const lossReasons = Object.fromEntries(Object.entries(records.flatMap((row) => row.decision === "REJECT" ? row.reasons : []).reduce((acc, reason) => (acc[reason] = (acc[reason] || 0) + 1, acc), {})).sort((a, b) => b[1] - a[1]).slice(0, 30));
const summary = { generatedAt: new Date().toISOString(), acquisitionSources: ledger.summary.acquiredSources, normalizedRecords: records.length, funnel: { contentValid: count("contentValid"), dateValid: count("dateValid"), fresh: count("fresh"), relevant: count("relevant"), negativeSafe: count("negativeSafe"), propertyNexus: count("propertyNexus"), geoValid: count("geoValid"), dedupePass: count("dedupePass"), wouldPublish: decisions.WOULD_PUBLISH || 0, review: decisions.REVIEW || 0, reject: decisions.REJECT || 0 }, decisions, topRejectReasons: lossReasons, note: "Canonical evaluation only. No source fetch, production API, backfill, or sent-news mutation was performed." };
const outDir = path.join(root, "reports/task42-prep");
await fs.writeFile(path.join(outDir, "task42-recovered-canonical-evaluation.json"), `${JSON.stringify({ summary, records }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
