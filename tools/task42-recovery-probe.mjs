import fs from "node:fs/promises";
import path from "node:path";

process.env.DRY_RUN = "true";
process.env.APP_API_URL = "";
process.env.APP_API_KEY = "";
process.env.SOURCE_FETCH_TIMEOUT_MS = "10000";
process.env.SOURCE_RETRY_ATTEMPTS = "1";
process.env.MAX_ITEMS_PER_SOURCE = "3";
process.env.MAX_PAGES_PER_SOURCE = "2";

const { applyCityCode, fetchSourceWithRecovery, isPublishableArticle } = await import("../src/index.js");
const root = process.cwd();
const rows = JSON.parse(await fs.readFile(path.join(root, "reports/task42-prep/task42-source-funnel.json"), "utf8")).sources;
const targetStates = new Set(["TIMEOUT", "DISCOVERY_BROKEN", "ARTICLE_EXTRACTION_BROKEN", "LISTING_ONLY"]);
const targets = rows.filter((row) => targetStates.has(row.state));
const results = new Array(targets.length);
let next = 0;
let writeChain = Promise.resolve();
let completedCount = 0;
const partialPath = path.join(root, "reports/task42-prep/task42-recovery-probe-partial.json");
const persistPartial = () => {
  if (completedCount % 10 !== 0 && completedCount !== targets.length) return writeChain;
  writeChain = writeChain.then(() => fs.writeFile(partialPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), completed: results.filter(Boolean).length, total: targets.length, results }, null, 2)}\n`));
  return writeChain;
};
const worker = async () => {
  while (true) {
    const index = next++;
    if (index >= targets.length) return;
    const row = targets[index];
    const started = Date.now();
    const controller = new AbortController();
    const deadlineAt = Date.now() + 12000;
    const deadlineTimer = setTimeout(() => controller.abort(), 12000);
    try {
      const result = await fetchSourceWithRecovery(row.url, { signal: controller.signal, deadlineAt });
      const articles = Array.isArray(result?.articles) ? result.articles.slice(0, 3) : [];
      const qualified = articles.map((article) => {
        const boundedText = String(article.articleText || article.description || "").slice(0, 8000);
        const boundedArticle = { ...article, articleText: boundedText, description: String(article.description || boundedText).slice(0, 1200) };
        const routed = applyCityCode(boundedArticle);
        const dateValue = article.publishedAt || article.createdAt || "";
        const publishedMs = Date.parse(dateValue);
        const current = Number.isFinite(publishedMs) && Date.now() - publishedMs <= 20 * 86400000;
        return { current, geo: Boolean(routed.cityCode), publishable: current && isPublishableArticle(routed, new Set()) };
      });
      results[index] = {
        source_id: row.source_id,
        url: row.url,
        before_state: row.state,
        recovery: articles.length ? "RECOVERED_CONTENT" : "RECOVERED_EMPTY",
        fetched_source: result?.fetchedSource || row.url,
        recovered_alias: Boolean(result?.recovered),
        articles: articles.length,
        readable_articles: articles.filter((article) => article.fullArticleRead || article.articleText || article.description).length,
        current_articles: qualified.filter((article) => article.current).length,
        geo_valid_articles: qualified.filter((article) => article.geo).length,
        canonical_candidates: qualified.filter((article) => article.publishable).length,
        elapsed_ms: Date.now() - started,
        error: ""
      };
    } catch (error) {
      results[index] = {
        source_id: row.source_id,
        url: row.url,
        before_state: row.state,
        recovery: "STILL_FAILED",
        fetched_source: "",
        recovered_alias: false,
        articles: 0,
        readable_articles: 0,
        current_articles: 0,
        geo_valid_articles: 0,
        canonical_candidates: 0,
        elapsed_ms: Date.now() - started,
        error: String(error?.message || error)
      };
    } finally {
      clearTimeout(deadlineTimer);
      completedCount += 1;
      await persistPartial();
    }
  }
};
await Promise.all(Array.from({ length: 24 }, worker));
completedCount = targets.length;
await persistPartial();
await writeChain;
const summary = {
  generatedAt: new Date().toISOString(),
  targetCount: results.length,
  recoveredContent: results.filter((row) => row.recovery === "RECOVERED_CONTENT").length,
  recoveredEmpty: results.filter((row) => row.recovery === "RECOVERED_EMPTY").length,
  stillFailed: results.filter((row) => row.recovery === "STILL_FAILED").length,
  recoveredArticles: results.reduce((sum, row) => sum + row.articles, 0),
  recoveredCurrentArticles: results.reduce((sum, row) => sum + row.current_articles, 0),
  recoveredGeoValidArticles: results.reduce((sum, row) => sum + row.geo_valid_articles, 0),
  recoveredCanonicalCandidates: results.reduce((sum, row) => sum + row.canonical_candidates, 0),
  byBeforeState: Object.fromEntries(Object.entries(results.reduce((acc, row) => {
    const item = acc[row.before_state] || { total: 0, recoveredContent: 0, stillFailed: 0 };
    item.total += 1;
    if (row.recovery === "RECOVERED_CONTENT") item.recoveredContent += 1;
    if (row.recovery === "STILL_FAILED") item.stillFailed += 1;
    acc[row.before_state] = item;
    return acc;
  }, {}))),
  note: "Read-only adapter recovery probe. No production API, sent-news state, or backfill state was used."
};
const outDir = path.join(root, "reports/task42-prep");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "task42-recovery-probe.json"), `${JSON.stringify({ summary, results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
