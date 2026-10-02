import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { classifyArticle, getSourceUrls, isAllowedSource, isLikelyFeedUrl, getFeedFallbackPageUrl } from "../src/index.js";
import { citySourceRules } from "../src/city-config.js";
import { extractStructuredListing, rankArticleLinks } from "./source-recovery-adapters.mjs";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const settingsPath = path.join(rootDir, "config", "admin-settings.json");
const outputDir = path.join(rootDir, "reports", "source-audits");
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36 BrokketNewsSourceAudit/1.0";
const timeoutMs = Number(process.env.SOURCE_AUDIT_TIMEOUT_MS || 12000);
const concurrency = Math.max(1, Math.min(Number(process.env.SOURCE_AUDIT_CONCURRENCY || 28), 40));
const parser = new Parser();
const articleSampleSize = Math.max(0, Math.min(Number(process.env.SOURCE_AUDIT_ARTICLE_SAMPLE || 3), 5));
const maxBodyBytes = Math.max(250_000, Math.min(Number(process.env.SOURCE_AUDIT_MAX_BODY_BYTES || 1_000_000), 3_000_000));

function normalizeSourceUrl(value = "") {
  try {
    const url = new URL(String(value).trim());
    url.hash = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  }
}

function hostOf(value = "") {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stableId(value = "") {
  let hash = 0;
  for (const char of String(value)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `source-${Math.abs(hash)}`;
}

async function readSettings() {
  try {
    return JSON.parse(await fs.readFile(settingsPath, "utf8"));
  } catch {
    return { manualSources: [], disabledSourceUrls: [], disabledSourceIds: [] };
  }
}

function buildCitySourceMap() {
  const map = new Map();
  for (const rule of citySourceRules) {
    for (const url of rule.urls || []) {
      const key = normalizeSourceUrl(url);
      if (!key) continue;
      const row = map.get(key) || { cityCodes: new Set(), origins: new Set(), labels: new Set() };
      row.cityCodes.add(rule.code);
      row.origins.add("city-config");
      row.labels.add(rule.code);
      map.set(key, row);
    }
  }
  return map;
}

function sourceNotes(url, cityCodes = []) {
  const lower = url.toLowerCase();
  const notes = [];
  if (lower.includes("businessoffood.in")) notes.push("adjacent retail/F&B source; filters must require real-estate/project/lease terms");
  if (lower.includes("/rss/latest") || lower.endsWith("/section/cities/")) notes.push("broad source; keep only with strict article filters");
  if (lower.includes("indianexpress.com/section/cities/delhi")) notes.push("blocked broad Delhi source; use NCR city-specific rules instead");
  if (lower.includes("feed") || lower.includes("rss")) notes.push("feed source; page fallback is available if parsing fails");
  if (cityCodes.length === 0) notes.push("national/shared source; city routing depends on article text");
  return notes.join("; ");
}

async function probeOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/rss+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
      }
    });
    const contentType = response.headers.get("content-type") || "";
    let body = "";
    try {
      body = await readResponseBody(response, controller, maxBodyBytes);
    } catch {
      body = "";
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      contentType,
      elapsedMs: Date.now() - startedAt,
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: "",
      statusText: "",
      finalUrl: "",
      contentType: "",
      elapsedMs: Date.now() - startedAt,
      error: controller.signal.aborted ? `timeout after ${timeoutMs}ms` : error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBody(response, controller, bodyLimit) {
  if (!response.body) return (await response.text()).slice(0, bodyLimit);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let size = 0;
  try {
    while (size < bodyLimit) {
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`body read timeout after ${timeoutMs}ms`)), timeoutMs))
      ]);
      if (result.done) break;
      const value = result.value || new Uint8Array();
      const remaining = Math.max(0, bodyLimit - size);
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(decoder.decode(chunk, { stream: true }));
      size += chunk.byteLength;
      if (chunk.byteLength < value.byteLength) break;
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    controller.abort();
    await reader.cancel().catch(() => {});
  }
}

function absoluteUrl(value, baseUrl) {
  try { return new URL(String(value || "").trim(), baseUrl).toString(); } catch { return ""; }
}

function parseDateValue(value = "") {
  const date = new Date(String(value || "").trim());
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isFeedContent(body = "", contentType = "") {
  const start = body.trimStart().slice(0, 300).toLowerCase();
  return /xml|rss|atom/i.test(contentType) || start.startsWith("<?xml") || /<(rss|feed)\b/i.test(start);
}

async function extractListingContent(sourceUrl, probe) {
  const body = probe.body || "";
  if (isFeedContent(body, probe.contentType)) {
    try {
      const feed = await Promise.race([
        parser.parseString(body),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`feed parse timeout after ${timeoutMs}ms`)), timeoutMs))
      ]);
      const items = Array.isArray(feed.items) ? feed.items : [];
      const links = items.map((item) => absoluteUrl(item.link || item.guid, sourceUrl)).filter(Boolean);
      const dates = items.map((item) => parseDateValue(item.isoDate || item.pubDate || item.date)).filter(Boolean).sort().reverse();
      return { method: /atom/i.test(probe.contentType || "") ? "ATOM" : "RSS", links: [...new Set(links)], latestArticleDate: dates[0] || "", dateCount: dates.length, thumbnailCount: items.filter((item) => item.enclosure?.url || item.media?.content?.url || item.image?.url).length, parseError: "" };
    } catch (error) {
      return { method: "RSS_OR_ATOM", links: [], latestArticleDate: "", dateCount: 0, thumbnailCount: 0, parseError: error.message };
    }
  }

  const $ = cheerio.load(body);
  const sourceHost = hostOf(sourceUrl);
  const genericCandidates = [];
  $("a[href]").each((_, element) => {
    const link = absoluteUrl($(element).attr("href"), sourceUrl);
    const title = $(element).text().replace(/\s+/g, " ").trim();
    const isDocument = /\.pdf(?:$|\?)/i.test(link || "");
    if (!link || (!isDocument && title.length < 18) || hostOf(link) !== sourceHost || normalizeSourceUrl(link) === normalizeSourceUrl(sourceUrl)) return;
    genericCandidates.push({ link, title });
  });
  const structured = extractStructuredListing($, sourceUrl);
  const links = rankArticleLinks([...genericCandidates, ...structured.links], sourceUrl).map((candidate) => candidate.link);
  const dates = $("time[datetime], meta[property='article:published_time'], meta[name='publish-date'], meta[name='date']")
    .map((_, element) => parseDateValue($(element).attr("datetime") || $(element).attr("content"))).get().filter(Boolean).sort().reverse();
  const allDates = [...new Set([...dates, ...structured.dates])].sort().reverse();
  return { method: ["HTML_GENERIC_EXTRACTOR", structured.method].filter(Boolean).join("+") , links: [...new Set(links)], latestArticleDate: allDates[0] || "", dateCount: allDates.length, thumbnailCount: $("meta[property='og:image'], meta[name='twitter:image'], img[src]").length + structured.thumbnailCount, parseError: "" };
}

function extractArticleContent(probe) {
  if (!probe.ok || !probe.body) return { readable: false, date: "", thumbnail: false, language: "", textLength: 0, error: probe.error || probe.statusText || "article fetch failed" };
  const $ = cheerio.load(probe.body);
  const text = $("article, main, [itemprop='articleBody'], .article-content, .story-content, body").first().text().replace(/\s+/g, " ").trim();
  const structured = extractStructuredListing($, probe.finalUrl || probe.checkedUrl || "");
  const date = $("meta[property='article:published_time'], meta[name='publish-date'], time[datetime]").map((_, element) => parseDateValue($(element).attr("content") || $(element).attr("datetime"))).get().find(Boolean) || structured.dates[0] || "";
  const image = $("meta[property='og:image'], meta[name='twitter:image'], img[src]").first();
  const thumbnail = Boolean(image.attr("content") || image.attr("src"));
  const language = String($("html").attr("lang") || "").trim();
  return { readable: text.length >= 200, date, thumbnail, language, textLength: text.length, error: text.length >= 200 ? "" : "insufficient readable text", title: $("h1").first().text().replace(/\s+/g, " ").trim() || $("title").text().replace(/\s+/g, " ").trim(), text };
}

async function auditContent(row, transport) {
  const { body: _body, ...transportSummary } = transport;
  if (!transport.ok) {
    const status = Number(transport.status || 0);
    const health = status === 403 || status === 406 ? "BLOCKED" : status === 404 ? "BROKEN_URL" : status === 503 ? "NEEDS_REVIEW" : "TRANSPORT_FAILED";
    return { ...row, ...transportSummary, health, contentHealth: health, articleLinksDiscovered: 0, articlesSampled: 0, fullArticlesReadable: 0, relevantArticles: 0, freshness: "not-available" };
  }

  const listing = await extractListingContent(row.url, transport);
  const links = listing.links.slice(0, articleSampleSize);
  const sampled = await mapWithConcurrency(links, Math.min(3, articleSampleSize), async (link) => {
    const articleProbe = await probeOnce(link);
    const extracted = extractArticleContent(articleProbe);
    const classification = extracted.readable ? classifyArticle({ title: extracted.title || link, description: extracted.title || "", articleText: extracted.text, newsLink: link, sourceUrl: row.url, publishedAt: extracted.date }) : "unreadable";
    return { ...extracted, link, classification };
  });
  const readable = sampled.filter((item) => item.readable).length;
  const relevant = sampled.filter((item) => !["unreadable", "unclassified", "reject_negative"].includes(item.classification)).length;
  const latest = listing.latestArticleDate ? new Date(listing.latestArticleDate) : null;
  const stale = latest && Date.now() - latest.getTime() > 45 * 24 * 60 * 60 * 1000;
  let contentHealth = "HEALTHY";
  if (articleSampleSize === 0) {
    contentHealth = listing.parseError ? "EXTRACTION_FAILED" : listing.links.length > 0 ? "LISTING_ONLY" : "NOT_SAMPLED";
  } else if (listing.parseError) contentHealth = "EXTRACTION_FAILED";
  else if (links.length === 0) contentHealth = "EMPTY";
  else if (readable === 0) contentHealth = "EXTRACTION_FAILED";
  else if (stale) contentHealth = "STALE";
  else if (!listing.latestArticleDate) contentHealth = "NEEDS_REVIEW";
  else if (readable < links.length || sampled.some((item) => !item.date)) contentHealth = "DEGRADED";
  return {
    ...row,
    ...transportSummary,
    health: contentHealth,
    contentHealth,
    listingMethod: listing.method,
    articleLinksDiscovered: listing.links.length,
    articlesSampled: sampled.length,
    fullArticlesReadable: readable,
    publicationDatesExtracted: sampled.filter((item) => item.date).length,
    thumbnailsExtracted: sampled.filter((item) => item.thumbnail).length,
    languagesDetected: sampled.filter((item) => item.language).length,
    relevantArticles: relevant,
    latestArticleDate: listing.latestArticleDate,
    freshness: stale ? "stale" : listing.latestArticleDate ? "current-or-recent" : "unknown",
    listingExtraction: listing.links.length > 0 ? "success" : listing.parseError ? "failed" : "empty",
    articleExtraction: readable > 0 ? "success" : "failed",
    fallbackTested: Boolean(transport.fallbackUsed),
    sampledArticleResults: sampled.map(({ link, readable: isReadable, date, thumbnail, language, textLength, classification, error }) => ({ link, readable: isReadable, date, thumbnail, language, textLength, classification, error }))
  };
}

async function probeSource(url) {
  const first = await probeOnce(url);
  if (first.ok) return { ...first, checkedUrl: url, fallbackUsed: false };

  const fallback = isLikelyFeedUrl(url) ? getFeedFallbackPageUrl(url) : "";
  if (fallback && normalizeSourceUrl(fallback) !== normalizeSourceUrl(url)) {
    const second = await probeOnce(fallback);
    return {
      ...second,
      checkedUrl: fallback,
      fallbackUsed: true,
      originalStatus: first.status,
      originalError: first.error || first.statusText || "not ok"
    };
  }

  return { ...first, checkedUrl: url, fallbackUsed: false };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

const settings = await readSettings();
const manualByUrl = new Map();
for (const source of settings.manualSources || []) {
  const key = normalizeSourceUrl(source.url);
  if (!key) continue;
  const existing = manualByUrl.get(key) || [];
  existing.push(source);
  manualByUrl.set(key, existing);
}
const citySourceMap = buildCitySourceMap();
const enabledRuntimeUrls = getSourceUrls();
const enabledRuntimeKeys = enabledRuntimeUrls.map(normalizeSourceUrl);
const allKnownUrls = new Map();
for (const url of enabledRuntimeUrls) allKnownUrls.set(normalizeSourceUrl(url), url);
for (const source of settings.manualSources || []) {
  const key = normalizeSourceUrl(source.url);
  if (key && !allKnownUrls.has(key)) allKnownUrls.set(key, source.url);
}
for (const [key] of citySourceMap) {
  if (key && !allKnownUrls.has(key)) allKnownUrls.set(key, key);
}

const duplicateCounts = new Map();
for (const [key] of allKnownUrls) duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
for (const source of settings.manualSources || []) {
  const key = normalizeSourceUrl(source.url);
  if (key) duplicateCounts.set(key, Math.max(duplicateCounts.get(key) || 0, manualByUrl.get(key)?.length || 1));
}

const rows = [...allKnownUrls.entries()].filter(([key]) => Boolean(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, url]) => {
  const manualRows = manualByUrl.get(key) || [];
  const cityRow = citySourceMap.get(key);
  const cityCodes = [...new Set([
    ...manualRows.flatMap((source) => source.cityCodes || []),
    ...[...(cityRow?.cityCodes || [])]
  ])].sort();
  const enabledManual = manualRows.length === 0 || manualRows.some((source) => source.enabled !== false);
  const disabledManual = manualRows.length > 0 && manualRows.every((source) => source.enabled === false);
  const allowed = isAllowedSource(url);
  const inRuntime = enabledRuntimeKeys.includes(key);
  const origin = [
    manualRows.length ? "manual" : "",
    cityRow ? "city-config" : "",
    inRuntime && !manualRows.length && !cityRow ? "default" : ""
  ].filter(Boolean).join("+") || "unknown";
  return {
    id: manualRows[0]?.id || stableId(url),
    label: manualRows.map((source) => source.label).filter(Boolean).join(" | ") || [...(cityRow?.labels || [])].join(", ") || hostOf(url),
    url,
    host: hostOf(url),
    origin,
    category: [...new Set(manualRows.map((source) => source.category || "manual"))].join(", ") || (cityRow ? "city" : "default"),
    enabledInAdmin: !disabledManual && enabledManual,
    allowedByRuntime: allowed,
    selectedInRuntime: inRuntime,
    cityCodes,
    duplicateCount: duplicateCounts.get(key) || 1,
    notes: sourceNotes(url, cityCodes)
  };
});

console.log(`Auditing ${rows.length} known source URLs with concurrency ${concurrency}, timeout ${timeoutMs}ms.`);
const audited = await mapWithConcurrency(rows, concurrency, async (row, index) => {
  const shouldProbe = row.enabledInAdmin && row.allowedByRuntime;
  if (!shouldProbe) {
    return { ...row, health: row.allowedByRuntime ? "DISABLED" : "BLOCKED", contentHealth: row.allowedByRuntime ? "DISABLED" : "BLOCKED", checkedUrl: "", httpStatus: "", finalUrl: "", elapsedMs: "", error: row.allowedByRuntime ? "disabled in admin" : "blocked by runtime source policy", fallbackUsed: false };
  }
  const probeWatchdogMs = Math.max(10_000, timeoutMs * 2);
  let probeWatchdog;
  const result = await Promise.race([
    probeSource(row.url),
    new Promise((resolve) => {
      probeWatchdog = setTimeout(() => resolve({
        ok: false,
        status: "",
        statusText: "",
        finalUrl: "",
        contentType: "",
        elapsedMs: probeWatchdogMs,
        error: `source probe exceeded ${probeWatchdogMs}ms`,
        checkedUrl: row.url,
        fallbackUsed: false
      }), probeWatchdogMs);
    })
  ]);
  clearTimeout(probeWatchdog);
  const watchdogMs = Math.max(10_000, timeoutMs * 2);
  let watchdog;
  const auditedRow = await Promise.race([
    auditContent(row, result),
    new Promise((resolve) => {
      watchdog = setTimeout(() => resolve({
        ...row,
        ...result,
        health: "NEEDS_REVIEW",
        contentHealth: "NEEDS_REVIEW",
        auditTimeout: true,
        error: `content audit exceeded ${watchdogMs}ms`
      }), watchdogMs);
    })
  ]);
  clearTimeout(watchdog);
  if ((index + 1) % 25 === 0 || !result.ok || auditedRow.contentHealth !== "HEALTHY") {
    console.log(`${index + 1}/${rows.length} ${auditedRow.contentHealth}: ${row.url}${result.fallbackUsed ? ` -> ${result.checkedUrl}` : ""}${result.error ? ` (${result.error})` : result.status ? ` (${result.status})` : ""}`);
  }
  return auditedRow;
});

function classifySourceHealth(row) {
  if (!row.enabledInAdmin) return "UNSUITABLE_SOURCE";
  if (!row.allowedByRuntime) return "INVALID_SOURCE";
  const status = Number(row.status || row.httpStatus || 0);
  const failure = String(row.error || row.originalError || "").toLowerCase();
  if (status === 403 || status === 406) return "BLOCKED_403";
  if (status === 401 || status === 429) return "BLOCKED_OTHER";
  if (status === 404) return "HTTP_404";
  if (status >= 500 && status <= 599) return "HTTP_5XX";
  if (/timeout|timed out|abort/.test(failure)) return "TIMEOUT";
  if (/dns|enotfound|getaddrinfo|name resolution/.test(failure)) return "DNS_FAILURE";
  if (/tls|certificate|ssl|secure connection/.test(failure)) return "TLS_FAILURE";
  if (!row.ok) return "UNKNOWN";
  if (row.contentHealth === "STALE") return "STALE";
  if (row.contentHealth === "EMPTY") return row.bodyBytes === 0 ? "EMPTY_RESPONSE" : "HEALTHY_NO_CURRENT_STORY";
  if (row.contentHealth === "EXTRACTION_FAILED") return "EXTRACTION_BROKEN";
  if (row.contentHealth === "DEGRADED" && !row.publicationDatesExtracted) return "DATE_BROKEN";
  if (row.contentHealth === "DEGRADED") return "EXTRACTION_BROKEN";
  if (row.contentHealth === "HEALTHY" && Number(row.relevantArticles || 0) > 0) return "HEALTHY_PRODUCTIVE";
  // A listing-only audit proves transport and page structure, not article
  // readability. Keep unsampled rows out of the healthy bucket so a 200
  // response cannot masquerade as a productive discovery surface.
  if (row.contentHealth === "LISTING_ONLY" && Number(process.env.SOURCE_AUDIT_ARTICLE_SAMPLE || 0) === 0) return "UNKNOWN";
  if (row.contentHealth === "NOT_SAMPLED") return "UNKNOWN";
  if (["HEALTHY", "LISTING_ONLY"].includes(row.contentHealth)) return "HEALTHY_LOW_YIELD";
  if (row.contentHealth === "NEEDS_REVIEW") return "UNKNOWN";
  return "UNKNOWN";
}

const inventory = audited.map((row) => ({
  ...row,
  sourceId: row.id,
  sourceName: row.label,
  type: row.category,
  language: row.language || "unknown",
  cityStateScope: row.cityCodes || [],
  latestStatus: row.contentHealth || row.health || "UNKNOWN",
  latestHttpResult: row.status || row.httpStatus || 0,
  redirect: row.finalUrl && normalizeSourceUrl(row.finalUrl) !== normalizeSourceUrl(row.url) ? row.finalUrl : "",
  failureReason: row.error || row.originalError || "",
  lastSuccessfulFetch: row.ok ? row.generatedAt || new Date().toISOString() : "",
  lastUsableDiscovery: row.articleLinksDiscovered > 0 ? row.generatedAt || new Date().toISOString() : "",
  lastUsableArticle: row.fullArticlesReadable > 0 ? row.generatedAt || new Date().toISOString() : "",
  currentClassification: classifySourceHealth(row)
}));

const summary = {
  generatedAt: new Date().toISOString(),
  total: inventory.length,
  transportReachable: inventory.filter((row) => row.ok === true).length,
  contentHealthy: inventory.filter((row) => row.contentHealth === "HEALTHY").length,
  listingOnly: inventory.filter((row) => row.contentHealth === "LISTING_ONLY").length,
  notSampled: inventory.filter((row) => row.contentHealth === "NOT_SAMPLED").length,
  contentDegraded: inventory.filter((row) => row.contentHealth === "DEGRADED").length,
  stale: inventory.filter((row) => row.contentHealth === "STALE").length,
  empty: inventory.filter((row) => row.contentHealth === "EMPTY").length,
  extractionFailed: inventory.filter((row) => row.contentHealth === "EXTRACTION_FAILED").length,
  blocked: inventory.filter((row) => row.contentHealth === "BLOCKED").length,
  brokenUrl: inventory.filter((row) => row.contentHealth === "BROKEN_URL").length,
  transportFailed: inventory.filter((row) => row.contentHealth === "TRANSPORT_FAILED").length,
  needsReview: inventory.filter((row) => row.contentHealth === "NEEDS_REVIEW").length,
  selectedInRuntime: inventory.filter((row) => row.selectedInRuntime).length,
  fallbackUsed: inventory.filter((row) => row.fallbackUsed).length,
  duplicateRows: inventory.filter((row) => row.duplicateCount > 1).length,
  classifications: Object.fromEntries([...new Set(inventory.map((row) => row.currentClassification))].sort().map((key) => [key, inventory.filter((row) => row.currentClassification === key).length]))
};

await fs.mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonPath = path.join(outputDir, `source-audit-${stamp}.json`);
await fs.writeFile(jsonPath, JSON.stringify({ summary, rows: inventory }, null, 2));
console.log(`Source audit JSON written: ${jsonPath}`);
console.log(JSON.stringify(summary, null, 2));






