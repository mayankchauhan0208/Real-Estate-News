import fs from "node:fs/promises";
import path from "node:path";

process.env.DRY_RUN = "true";
process.env.APP_API_URL = "";
process.env.APP_API_KEY = "";
process.env.SOURCE_FETCH_TIMEOUT_MS = "10000";
process.env.SOURCE_RETRY_ATTEMPTS = "1";
process.env.MAX_ITEMS_PER_SOURCE = "3";
process.env.MAX_PAGES_PER_SOURCE = "2";

const { fetchSourceWithRecovery } = await import("../src/index.js");
const root = process.cwd();
const prior = JSON.parse(await fs.readFile(path.join(root, "reports/task42-prep/task42-recovery-probe.json"), "utf8"));
const targets = prior.results.filter((row) => row.recovery === "RECOVERED_CONTENT");
const outDir = path.join(root, "reports/task42-prep");
const partialPath = path.join(outDir, "task42-acquisition-ledger-partial.json");
const finalPath = path.join(outDir, "task42-acquisition-ledger.json");
await fs.mkdir(outDir, { recursive: true });

const originalLog = console.log;
const originalWarn = console.warn;
console.log = () => {};
console.warn = () => {};

const results = new Array(targets.length);
let next = 0;
let completed = 0;
let writeChain = Promise.resolve();
const persist = (force = false) => {
  if (!force && completed % 10 !== 0) return writeChain;
  writeChain = writeChain.then(() => fs.writeFile(partialPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), completed, total: targets.length, records: results }, null, 2)}\n`));
  return writeChain;
};
const normalizeArticle = (article) => ({
  title: String(article.title || "").trim(),
  description: String(article.description || "").slice(0, 4000),
  articleText: String(article.articleText || "").slice(0, 12000),
  newsLink: article.newsLink || article.url || "",
  sourceUrl: article.sourceUrl || "",
  publishedAt: article.publishedAt || article.createdAt || "",
  createdAt: article.createdAt || article.publishedAt || "",
  thumbnailImage: article.thumbnailImage || "",
  postedBy: article.postedBy || "",
  fullArticleRead: Boolean(article.fullArticleRead),
  articleReadAttempted: Boolean(article.articleReadAttempted),
  authoritativeContent: Boolean(article.authoritativeContent),
  sourceMode: article.sourceMode || ""
});
const worker = async () => {
  while (true) {
    const index = next++;
    if (index >= targets.length) return;
    const target = targets[index];
    const started = Date.now();
    const controller = new AbortController();
    const deadlineAt = Date.now() + 12000;
    const timer = setTimeout(() => controller.abort(), 12000);
    let record;
    try {
      const fetchPromise = fetchSourceWithRecovery(target.url, { signal: controller.signal, deadlineAt });
      fetchPromise.catch(() => {});
      const result = await Promise.race([
        fetchPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 12000))
      ]);
      const articles = Array.isArray(result?.articles) ? result.articles.slice(0, 10).map(normalizeArticle) : [];
      record = { source_id: target.source_id, url: target.url, before_state: target.before_state, status: articles.length ? "ACQUIRED" : "EMPTY_AFTER_RECOVERY", fetched_source: result?.fetchedSource || "", recovered_alias: Boolean(result?.recovered), articles, elapsed_ms: Date.now() - started, error: "" };
    } catch (error) {
      record = { source_id: target.source_id, url: target.url, before_state: target.before_state, status: "ACQUISITION_FAILED", fetched_source: "", recovered_alias: false, articles: [], elapsed_ms: Date.now() - started, error: String(error?.message || error) };
    } finally {
      clearTimeout(timer);
      results[index] = record;
      completed += 1;
      await persist();
    }
  }
};
try {
  await Promise.all(Array.from({ length: 12 }, worker));
  await persist(true);
} finally {
  console.log = originalLog;
  console.warn = originalWarn;
}
const summary = { generatedAt: new Date().toISOString(), targetSources: targets.length, acquiredSources: results.filter((row) => row.status === "ACQUIRED").length, emptyAfterRecovery: results.filter((row) => row.status === "EMPTY_AFTER_RECOVERY").length, acquisitionFailed: results.filter((row) => row.status === "ACQUISITION_FAILED").length, normalizedRecords: results.reduce((sum, row) => sum + row.articles.length, 0), note: "Acquisition-only ledger. Canonical evaluation is performed by a separate process; no production API or backfill state is used." };
await fs.writeFile(finalPath, `${JSON.stringify({ summary, records: results }, null, 2)}\n`);
originalLog(JSON.stringify(summary, null, 2));
