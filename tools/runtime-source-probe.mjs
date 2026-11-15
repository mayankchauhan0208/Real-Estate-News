import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyCityCode, fetchSourceWithRecovery, getArticleFinalState, getRejectionReasons } from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const urlsFile = process.env.SOURCE_RUNTIME_PROBE_URLS_FILE || "reports/source-capabilities/priority-source-probe-urls.txt";
const timeoutMs = Math.max(5_000, Math.min(Number(process.env.SOURCE_RUNTIME_PROBE_TIMEOUT_MS || 20_000), 60_000));
const concurrency = Math.max(1, Math.min(Number(process.env.SOURCE_RUNTIME_PROBE_CONCURRENCY || 2), 4));
const configuredUrls = String(process.env.SOURCE_RUNTIME_PROBE_URLS || "").trim();
const rawUrls = configuredUrls || await fs.readFile(path.resolve(root, urlsFile), "utf8");
const urls = [...new Set(rawUrls
  .split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean))];
const registryPath = path.join(root, "reports", "source-capabilities", "current-source-capability-registry.json");
const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));

function normalizeUrl(value = "") {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  }
}

const sourceContext = new Map(registry.rows.map((row) => [normalizeUrl(row.url), row]));

async function mapWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function probe(url) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(new Error("runtime source probe timeout")), timeoutMs);
  try {
    const result = await fetchSourceWithRecovery(url, {
      signal: controller.signal,
      deadlineAt: startedAt + timeoutMs
    });
    const articles = result.articles || [];
    const context = sourceContext.get(normalizeUrl(url));
    const decisions = articles.map((article) => {
      const routed = applyCityCode({
        ...article,
        sourceUrl: article.sourceUrl || url,
        sourceCityCodes: context?.cityCodes || [],
        regionalSource: context?.sourceType === "REGIONAL_NEWS"
      });
      const reasons = getRejectionReasons(routed, new Set());
      return { state: getArticleFinalState(routed, reasons), reasons };
    });
    const decisionCounts = Object.fromEntries([...new Set(decisions.map((decision) => decision.state))]
      .sort().map((state) => [state, decisions.filter((decision) => decision.state === state).length]));
    return {
      url,
      status: "SUCCESS",
      elapsedMs: Date.now() - startedAt,
      articlesDiscovered: articles.length,
      fullArticlesReadable: articles.filter((article) => article.fullArticleRead === true).length,
      datedArticles: articles.filter((article) => article.publishedAt).length,
      documentCandidates: articles.filter((article) => article.documentUrl || article.documentEvidenceUrl).length,
      decisionCounts,
      rejectedByContentGate: decisions.filter((decision) => decision.reasons.some((reason) => reason.includes("not positive"))).length,
      attempts: result.attempts || 1,
      fetchedSource: result.fetchedSource || url,
      recovered: result.recovered === true,
      sample: articles.slice(0, 2).map((article) => ({
        title: article.title,
        publishedAt: article.publishedAt || "",
        fullArticleRead: article.fullArticleRead === true,
        articleReadError: article.articleReadError || "",
        documentUrl: article.documentUrl || article.documentEvidenceUrl || "",
        cityCode: article.cityCode || ""
      }))
    };
  } catch (error) {
    return {
      url,
      status: controller.signal.aborted ? "TIMEOUT" : "ERROR",
      elapsedMs: Date.now() - startedAt,
      error: error?.message || String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

const rows = await mapWithConcurrency(urls, probe);
const summary = {
  generatedAt: new Date().toISOString(),
  sourceCount: rows.length,
  success: rows.filter((row) => row.status === "SUCCESS").length,
  timeout: rows.filter((row) => row.status === "TIMEOUT").length,
  errors: rows.filter((row) => row.status === "ERROR").length,
  discovered: rows.reduce((sum, row) => sum + (row.articlesDiscovered || 0), 0),
  fullArticlesReadable: rows.reduce((sum, row) => sum + (row.fullArticlesReadable || 0), 0)
};
const outDir = path.join(root, "reports", "source-capabilities", "runtime-probes");
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `runtime-source-probe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(outPath, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log(JSON.stringify({ ...summary, outPath }, null, 2));
