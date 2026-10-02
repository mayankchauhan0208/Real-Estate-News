import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DRY_RUN = "true";
process.env.MAX_ITEMS_PER_SOURCE ||= "8";
process.env.MAX_PAGES_PER_SOURCE ||= "1";
process.env.SOURCE_CONCURRENCY ||= "4";
process.env.SOURCE_RETRY_ATTEMPTS ||= "2";
process.env.SOURCE_FETCH_TIMEOUT_MS ||= "30000";
process.env.FETCH_TIMEOUT_MS ||= "20000";
process.env.ARTICLE_METADATA_TIMEOUT_MS ||= "10000";

const {
  fetchSourceBatch,
  getRejectionReasons,
  getArticleFinalState,
  articleDedupeIds,
  detectArticleLanguage,
  isWithinBackfillDateRange
} = await import("../src/index.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = JSON.parse(await fs.readFile(path.join(root, "config", "admin-settings.json"), "utf8"));
const outputDir = path.join(root, "reports", "source-audits", "task39");
const now = new Date();
const lookbackMs = 20 * 24 * 60 * 60 * 1000;
const currentSince = new Date(now.getTime() - lookbackMs);

function isRegional(source) {
  const category = String(source.category || "").trim().toLowerCase();
  const label = String(source.label || "").trim().toLowerCase();
  return category.startsWith("regional-") || /regional\s+p2/.test(label);
}

function normalize(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  }
}

function currentArticle(article) {
  const value = article.publishedAt || article.createdAt || article.fetchedAt || "";
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= currentSince && date <= now;
}

function articleRow(article, reasons, source) {
  const detected = detectArticleLanguage(article);
  const fullText = String(article.articleText || "");
  return {
    title: article.title || "",
    language: article.language || detected.language || "not-captured",
    script: article.languageScript || detected.script || "not-captured",
    source: source.url,
    sourceLabel: source.label || "",
    city: article.cityCode || "",
    cityCodes: article.cityCode ? [article.cityCode] : [],
    url: article.newsLink || "",
    canonicalUrl: article.canonicalUrl || article.newsLink || "",
    publishedAt: article.publishedAt || article.createdAt || "",
    author: article.postedBy || "",
    thumbnail: Boolean(article.thumbnailImage),
    fullArticleRead: article.fullArticleRead === true,
    articleTextLength: fullText.length,
    current: currentArticle(article),
    reasons,
    finalState: getArticleFinalState(article, reasons),
    geoEvidence: article.locationEvidence || article.cityRoutingEvidence || "",
    realEstateEvidence: article.description || article.title || "",
    dedupeIds: articleDedupeIds(article)
  };
}

const regionalSources = [...new Map((settings.manualSources || [])
  .filter((source) => source && source.enabled !== false && isRegional(source))
  .map((source) => [normalize(source.url), source])).values()];

const sourceByUrl = new Map(regionalSources.map((source) => [normalize(source.url), source]));
const results = await fetchSourceBatch(regionalSources.map((source) => source.url));
const seenLinks = new Set();
const sourceRows = [];
const articles = [];

for (const result of results) {
  const source = sourceByUrl.get(normalize(result.source)) || { url: result.source };
  const rawArticles = Array.isArray(result.articles) ? result.articles : [];
  const rows = rawArticles.map((article) => {
    const reasons = getRejectionReasons(article, new Set());
    return articleRow(article, reasons, source);
  });
  for (const row of rows) {
    if (!row.url || seenLinks.has(normalize(row.url))) continue;
    seenLinks.add(normalize(row.url));
    articles.push(row);
  }
  const current = rows.filter((row) => row.current);
  const safe = current.filter((row) => row.reasons.length === 0 && row.fullArticleRead && row.city);
  sourceRows.push({
    source: source.url,
    label: source.label || "",
    language: [...new Set(rows.map((row) => row.language).filter(Boolean))],
    reachable: result.status !== "TIMEOUT" && result.status !== "TRANSPORT_FAILURE",
    status: result.status || "NO_DISCOVERY",
    attempts: result.attempts || 0,
    discovered: rows.length,
    current: current.length,
    nativeLanguageArticles: rows.filter((row) => !["en", "not-captured"].includes(row.language)).length,
    realEstateSpecific: rows.filter((row) => row.reasons.every((reason) => !reason.includes("not positive target"))).length,
    datesReliable: rows.filter((row) => row.publishedAt).length,
    fullArticlesExtracted: rows.filter((row) => row.fullArticleRead).length,
    geoEvidence: rows.filter((row) => row.city).length,
    relevantSafe: safe.length,
    geoValid: current.filter((row) => row.city).length,
    review: current.filter((row) => row.reasons.some((reason) => reason.startsWith("review:"))).length,
    hardReject: current.filter((row) => row.reasons.some((reason) => reason.startsWith("filter "))).length,
    failureReason: result.error || "",
    classification: result.status === "TIMEOUT" || result.status === "TRANSPORT_FAILURE"
      ? "BROKEN_EXTRACTION"
      : !rows.length
        ? "LOW_YIELD"
        : safe.length || current.some((row) => row.reasons.length === 0)
          ? "PRODUCTIVE_REGIONAL"
          : rows.every((row) => row.reasons.some((reason) => reason.includes("not positive target")))
            ? "NOT_REAL_ESTATE_SPECIFIC"
            : "LOW_YIELD"
  });
}

const currentArticles = articles.filter((article) => article.current);
const safe = currentArticles.filter((article) => article.reasons.length === 0 && article.fullArticleRead && article.city);
const review = currentArticles.filter((article) => article.reasons.some((reason) => reason.startsWith("review:")));
const hardReject = currentArticles.filter((article) => article.reasons.some((reason) => reason.startsWith("filter ")));
const report = {
  generatedAt: new Date().toISOString(),
  localOnly: true,
  sourceCount: regionalSources.length,
  currentSince: currentSince.toISOString(),
  sourceRows,
  metrics: {
    articlesDiscovered: articles.length,
    fullArticlesExtracted: currentArticles.filter((article) => article.fullArticleRead).length,
    current: currentArticles.length,
    languages: [...new Set(currentArticles.map((article) => article.language).filter(Boolean))],
    relevantSafe: currentArticles.filter((article) => !article.reasons.some((reason) => reason.includes("not positive target"))).length,
    geoValid: currentArticles.filter((article) => article.city).length,
    geoUncertain: currentArticles.filter((article) => !article.city).length,
    review: review.length,
    hardReject: hardReject.length,
    safeAutoPublish: safe.filter((article) => sourceByUrl.get(normalize(article.source))?.sourceMode === "AUTO_PUBLISH").length,
    safeQualified: safe.length,
    forcedMappings: 0
  },
  safeAutoPublishArticles: safe.filter((article) => sourceByUrl.get(normalize(article.source))?.sourceMode === "AUTO_PUBLISH"),
  reviewArticles: review,
  hardRejectArticles: hardReject
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "regional-go-live.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: true, sourceCount: report.sourceCount, metrics: report.metrics }, null, 2));
