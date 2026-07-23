import fs from "node:fs/promises";
import path from "node:path";
import {
  classifyArticle,
  expandCityArticles,
  fetchSource,
  getRejectionReasons,
  getSourceUrls,
  isAllowedSource,
  isPublishableArticle,
  isWithinBackfillDateRange
} from "../src/index.js";

function env(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function getPositiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseDateBoundary(name, endOfDay = false) {
  const value = env(name);
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be a valid date.`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  }
  return date;
}

function getBackfillDateRange() {
  const from = parseDateBoundary("BACKFILL_FROM");
  const to = parseDateBoundary("BACKFILL_TO", true);
  if (from || to) return { from, to };

  const days = getPositiveIntegerEnv("PREVIEW_DAYS", 20);
  const fallbackTo = new Date();
  const fallbackFrom = new Date(fallbackTo);
  fallbackFrom.setDate(fallbackFrom.getDate() - days);
  return { from: fallbackFrom, to: fallbackTo };
}

function splitTargetCities() {
  return env("TARGET_CITY_CODES")
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function publicArticle(article) {
  return {
    id: article.id,
    title: article.title,
    description: article.description,
    articleText: article.articleText?.slice(0, 700) || "",
    cityCode: article.cityCode,
    sharedCityArticle: Boolean(article.sharedCityArticle),
    newsLink: article.newsLink,
    thumbnailImage: article.thumbnailImage,
    postedBy: article.postedBy,
    postedByLogo: article.postedByLogo,
    publishedAt: article.publishedAt,
    fetchedAt: article.fetchedAt,
    classification: classifyArticle(article)
  };
}

async function main() {
  process.env.DRY_RUN = "true";
  delete process.env.ALLOW_NOIDA_API;
  const selectedSources = getSourceUrls().filter(isAllowedSource);
  const maxItemsPerRun = getPositiveIntegerEnv("PREVIEW_MAX_ITEMS", 80);
  const sourceLimit = getPositiveIntegerEnv("PREVIEW_SOURCE_LIMIT", selectedSources.length);
  const backfillDateRange = getBackfillDateRange();
  const targetCities = new Set(splitTargetCities());
  const sentIds = new Set();
  const sourceSummaries = [];
  const allArticles = [];

  for (const source of selectedSources.slice(0, sourceLimit)) {
    try {
      const articles = await fetchSource(source);
      sourceSummaries.push({ source, fetched: articles.length, status: "ok" });
      allArticles.push(...articles);
      console.log(`Preview fetched ${articles.length} items from ${source}`);
    } catch (error) {
      sourceSummaries.push({ source, fetched: 0, status: "failed", error: error.message });
      console.log(`Preview failed ${source}: ${error.message}`);
    }
  }

  const expanded = allArticles
    .flatMap(expandCityArticles)
    .filter((article) => targetCities.size === 0 || targetCities.has(article.cityCode));
  const inDateWindow = expanded.filter((article) => isWithinBackfillDateRange(article, backfillDateRange));
  const publishable = inDateWindow
    .filter((article) => isPublishableArticle(article, sentIds))
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, maxItemsPerRun);
  const rejected = inDateWindow
    .map((article) => ({ article, reasons: getRejectionReasons(article, sentIds) }))
    .filter((item) => item.reasons.length > 0)
    .slice(0, 120);

  const byCity = {};
  for (const article of publishable) {
    byCity[article.cityCode] = (byCity[article.cityCode] || 0) + 1;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: {
      dryRun: true,
      noApiPosting: true,
      noidaEnabled: ["1", "true", "yes", "on"].includes((process.env.ENABLE_NOIDA_CITY || "").toLowerCase()),
      targetCities: [...targetCities],
      backfillFrom: backfillDateRange.from?.toISOString() || null,
      backfillTo: backfillDateRange.to?.toISOString() || null
    },
    summary: {
      sourcesChecked: sourceSummaries.length,
      sourceFailures: sourceSummaries.filter((source) => source.status === "failed").length,
      fetchedRaw: allArticles.length,
      expandedArticles: expanded.length,
      inDateWindow: inDateWindow.length,
      publishable: publishable.length,
      rejectedSample: rejected.length,
      byCity
    },
    sources: sourceSummaries,
    publishable: publishable.map(publicArticle),
    rejected: rejected.map(({ article, reasons }) => ({
      title: article.title,
      cityCode: article.cityCode,
      newsLink: article.newsLink,
      postedBy: article.postedBy,
      publishedAt: article.publishedAt,
      reasons
    }))
  };

  await fs.mkdir("data", { recursive: true });
  const outputPath = path.resolve("data/feed-preview.json");
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Preview feed written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
