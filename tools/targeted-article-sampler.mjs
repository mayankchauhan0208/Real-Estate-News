import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { classifyArticle, isLikelyFeedUrl } from "../src/index.js";
import { workbookCityRules } from "../src/city-config.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditDir = path.join(rootDir, "reports", "source-audits");
const targetDir = path.join(auditDir, "targeted");
const batch = String(process.env.TARGETED_BATCH || "unsampled").toLowerCase();
const listingTimeoutMs = Number(process.env.TARGETED_LISTING_TIMEOUT_MS || 5000);
const articleTimeoutMs = Number(process.env.TARGETED_ARTICLE_TIMEOUT_MS || 5000);
const sourceRuntimeMs = Number(process.env.TARGETED_SOURCE_RUNTIME_MS || 15000);
const maxBodyBytes = Math.max(250_000, Math.min(Number(process.env.TARGETED_MAX_BODY_BYTES || 500_000), 2_000_000));
const maxLinks = Math.max(1, Math.min(Number(process.env.TARGETED_MAX_ARTICLES || 2), 5));
const parser = new Parser();
const userAgent = "Mozilla/5.0 BrokketTargetedSampler/1.0";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function latestFile(directory, pattern) {
  const files = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => entry.name);
  files.sort().reverse();
  return files[0] ? path.join(directory, files[0]) : "";
}

async function mostCompleteRun(directory) {
  const files = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^news-run-.*\.json$/.test(entry.name))
    .map((entry) => path.join(directory, entry.name));
  let best = null;
  for (const file of files) {
    try {
      const candidate = await readJson(file);
      const score = Number(candidate.selectedSourceCount || candidate.sourceHealth?.length || 0);
      if (!best || score > best.score) best = { file, score, data: candidate };
    } catch {}
  }
  return best;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function absoluteUrl(value, base) {
  try { return new URL(String(value || "").trim(), base).toString(); } catch { return ""; }
}

function parseDate(value) {
  const date = new Date(String(value || "").trim());
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function languageOf(text, htmlLanguage = "") {
  if (htmlLanguage) return htmlLanguage;
  if (/[ऀ-ॿ]/u.test(text)) return "hi-or-devanagari";
  if (/[஀-௿]/u.test(text)) return "ta";
  if (/[ఀ-౿]/u.test(text)) return "te";
  if (/[ഀ-ൿ]/u.test(text)) return "ml";
  if (/[ಀ-೿]/u.test(text)) return "kn";
  if (/[઀-૿]/u.test(text)) return "gu";
  if (/[଀-୿]/u.test(text)) return "or";
  return /[A-Za-z]/.test(text) ? "en" : "unknown";
}

async function boundedFetch(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8"
      }
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    let size = 0;
    if (reader) {
      try {
        while (size < maxBodyBytes) {
          const part = await Promise.race([
            reader.read(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("body timeout")), timeoutMs))
          ]);
          if (part.done) break;
          const remaining = maxBodyBytes - size;
          const value = part.value || new Uint8Array();
          const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
          chunks.push(decoder.decode(chunk, { stream: true }));
          size += chunk.byteLength;
          if (chunk.byteLength < value.byteLength) break;
        }
        chunks.push(decoder.decode());
      } finally {
        controller.abort();
        await reader.cancel().catch(() => {});
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      finalUrl: response.url,
      body: chunks.join(""),
      truncated: size >= maxBodyBytes,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      finalUrl: "",
      body: "",
      durationMs: Date.now() - startedAt,
      error: controller.signal.aborted ? `timeout after ${timeoutMs}ms` : error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeFeed(probe) {
  const head = probe.body.trimStart().slice(0, 300);
  return /xml|rss|atom/i.test(probe.contentType) || /^<\?xml/i.test(head) || /<(rss|feed)\b/i.test(head);
}

async function parseListing(source, probe) {
  if (probe.body.length > 300_000) return { method: "BOUNDED_SIZE_GUARD", links: [], dates: [], thumbnails: 0, error: "LISTING_TOO_LARGE" };
  if (looksLikeFeed(probe)) {
    try {
      const feed = await parser.parseString(probe.body);
      const items = feed.items || [];
      return {
        method: "RSS_OR_ATOM",
        links: [...new Set(items.map((item) => absoluteUrl(item.link || item.guid, source)).filter(Boolean))],
        dates: items.map((item) => parseDate(item.isoDate || item.pubDate || item.date)).filter(Boolean),
        thumbnails: items.filter((item) => item.enclosure?.url || item.media?.content?.url || item.image?.url).length
      };
    } catch (error) {
      return { method: "RSS_OR_ATOM", links: [], dates: [], thumbnails: 0, error: `LISTING_PARSE_FAILED: ${error.message}` };
    }
  }
  const $ = cheerio.load(probe.body);
  const host = new URL(source).hostname.replace(/^www\./, "");
  const links = [];
  $("a[href]").each((_, el) => {
    const link = absoluteUrl($(el).attr("href"), source);
    const title = $(el).text().replace(/\s+/g, " ").trim();
    if (!link || title.length < 18 || new URL(link).hostname.replace(/^www\./, "") !== host) return;
    links.push(link);
  });
  const dates = $("time[datetime], meta[property='article:published_time'], meta[name='date'], meta[name='publish-date']")
    .map((_, el) => parseDate($(el).attr("datetime") || $(el).attr("content"))).get().filter(Boolean);
  return {
    method: "HTML_GENERIC_EXTRACTOR",
    links: [...new Set(links)],
    dates,
    thumbnails: $("meta[property='og:image'], meta[name='twitter:image'], img[src]").length
  };
}

function extractArticle(probe, link) {
  if (!probe.ok) return { state: probe.error?.startsWith("timeout") ? "ARTICLE_TIMEOUT" : "ARTICLE_FETCH_FAILED", link };
  if (probe.body.length > 300_000) return { state: "ARTICLE_TOO_LARGE", link, textLength: 0, thumbnail: false };
  if (/pdf/i.test(probe.contentType) || /\.pdf(?:$|[?#])/i.test(link)) return { state: "DOCUMENT_SOURCE", link, date: "", textLength: 0, thumbnail: false };
  try {
    const $ = cheerio.load(probe.body);
    const text = $("article, main, [itemprop='articleBody'], .article-content, .story-content, body").first().text().replace(/\s+/g, " ").trim();
    const title = $("h1").first().text().replace(/\s+/g, " ").trim() || $("title").text().replace(/\s+/g, " ").trim();
    const date = $("meta[property='article:published_time'], meta[name='publish-date'], time[datetime]").map((_, el) => parseDate($(el).attr("content") || $(el).attr("datetime"))).get().find(Boolean) || "";
    const image = $("meta[property='og:image'], meta[name='twitter:image'], img[src]").first();
    const language = languageOf(text, String($("html").attr("lang") || ""));
    const readable = text.length >= 200;
    return { state: readable ? "ARTICLE_OK" : "ARTICLE_READABILITY_FAILED", link, title, text, textLength: text.length, date, thumbnail: Boolean(image.attr("content") || image.attr("src")), language, truncated: probe.truncated };
  } catch (error) {
    return { state: "ARTICLE_PARSE_FAILED", link, error: error.message };
  }
}

function geoEvidence(text) {
  const lower = text.toLowerCase();
  const matches = [];
  for (const rule of workbookCityRules) {
    const keywords = [rule.name, rule.code, ...(rule.keywords || [])].filter(Boolean);
    const found = keywords.filter((keyword) => lower.includes(String(keyword).toLowerCase()));
    if (found.length) matches.push({ cityCode: rule.code, terms: [...new Set(found)].slice(0, 8) });
  }
  return matches;
}

function classifyState(result) {
  if (result.transport?.status === 403 || result.transport?.status === 406) return "BLOCKED";
  if (result.transport?.status === 404) return "BROKEN_URL";
  if (!result.transport?.ok) return result.transport?.error?.startsWith("timeout") ? "LISTING_TIMEOUT" : "LISTING_FETCH_FAILED";
  if (result.listing?.error === "LISTING_TOO_LARGE") return "LISTING_TOO_LARGE";
  if (result.listing?.error) return "LISTING_PARSE_FAILED";
  if (!result.listing?.links?.length) return "ZERO_LINKS";
  if (!result.articles?.length) return "PARTIAL_SAMPLE";
  if (result.articles.every((article) => article.state === "ARTICLE_TIMEOUT")) return "ARTICLE_TIMEOUT";
  if (result.articles.some((article) => article.state === "ARTICLE_OK")) return "SAMPLED_SUCCESSFULLY";
  return "PARTIAL_SAMPLE";
}

function sourceMatches(row, sourceSet) { return sourceSet.has(String(row.url || "").toLowerCase()); }

async function selectTargets(audit, run) {
  const rows = audit.rows || [];
  const zeroItems = new Set((run?.sourceHealth || []).filter((row) => row.count === 0).map((row) => String(row.source).toLowerCase()));
  const regional = /regional|hindi|marathi|gujarati|bengali|tamil|telugu|kannada|malayalam|punjabi|odia|language/i;
  if (batch === "unsampled") return rows.filter((row) => row.contentHealth === "NOT_SAMPLED");
  if (batch === "rera") return rows.filter((row) => /rera|naredco|nhsrcl/i.test(row.url));
  if (batch === "regional") return rows.filter((row) => regional.test(`${row.category || ""} ${row.url} ${row.notes || ""}`));
  if (batch === "zero-item") return rows.filter((row) => zeroItems.has(String(row.url).toLowerCase()));
  if (batch === "transport") return rows.filter((row) => row.contentHealth === "TRANSPORT_FAILED");
  if (batch === "all") return rows;
  throw new Error(`Unknown TARGETED_BATCH: ${batch}`);
}

async function sampleSource(row) {
  const startedAt = Date.now();
  const transport = await boundedFetch(row.url, listingTimeoutMs);
  const { body: _listingBody, ...transportSummary } = transport;
  const result = { source: row.url, sourceType: isLikelyFeedUrl(row.url) ? "RSS_OR_ATOM" : "HTML_OR_SPECIALIZED", configuredUrl: row.url, transport: transportSummary, listing: null, articles: [], startedAt: new Date().toISOString() };
  if (!transport.ok) { result.finalState = classifyState(result); return result; }
  result.listing = await parseListing(row.url, transport);
  const recentLinks = result.listing.links.slice(0, maxLinks);
  for (const link of recentLinks) {
    if (Date.now() - startedAt > sourceRuntimeMs) break;
    const articleProbe = await boundedFetch(link, articleTimeoutMs);
    const article = extractArticle(articleProbe, link);
    const text = `${article.title || ""} ${article.text || ""}`;
    article.geo = geoEvidence(text);
    article.relevance = article.state === "ARTICLE_OK" ? classifyArticle({ title: article.title, description: article.text.slice(0, 500), articleText: article.text, newsLink: link, sourceUrl: row.url, publishedAt: article.date }) : "unreadable";
    result.articles.push(article);
  }
  result.finalState = classifyState(result);
  result.durationMs = Date.now() - startedAt;
  result.metrics = {
    linksFound: result.listing.links.length,
    linksSampled: result.articles.length,
    fetchSuccess: result.articles.filter((article) => ["ARTICLE_OK", "ARTICLE_READABILITY_FAILED", "DOCUMENT_SOURCE"].includes(article.state)).length,
    fullTextSuccess: result.articles.filter((article) => article.state === "ARTICLE_OK").length,
    dates: result.articles.filter((article) => article.date).length,
    thumbnails: result.articles.filter((article) => article.thumbnail).length,
    languages: result.articles.filter((article) => article.language && article.language !== "unknown").length,
    geoSuccess: result.articles.filter((article) => article.geo?.length).length,
    relevant: result.articles.filter((article) => !["unreadable", "reject_negative", "unclassified"].includes(article.relevance)).length
  };
  return result;
}

async function main() {
  if (process.env.TARGETED_RESET === "true") await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  const auditPath = await latestFile(auditDir, /^source-audit-.*\.json$/);
  if (!auditPath) throw new Error("No source audit report found");
  const runSelection = await mostCompleteRun(path.join(rootDir, "reports", "runs"));
  const audit = await readJson(auditPath);
  const run = runSelection?.data || null;
  const targets = await selectTargets(audit, run);
  const checkpointPath = path.join(targetDir, `${batch}.jsonl`);
  const completed = new Set();
  try {
    const checkpoint = await fs.readFile(checkpointPath, "utf8");
    for (const line of checkpoint.split(/\r?\n/).filter(Boolean)) completed.add(JSON.parse(line).source);
  } catch {}
  const pending = targets.filter((row) => !completed.has(row.url));
  console.log(`Targeted batch ${batch}: ${targets.length} sources, ${pending.length} pending, max ${maxLinks} article links/source.`);
  for (const row of pending) {
    const result = await sampleSource(row);
    await fs.appendFile(checkpointPath, `${JSON.stringify(result)}\n`);
    console.log(`${result.finalState}: ${row.url} (${result.durationMs || 0}ms)`);
  }
  const lines = await fs.readFile(checkpointPath, "utf8");
  const results = lines.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const summary = {
    generatedAt: new Date().toISOString(), batch, sourceCount: results.length,
    states: Object.fromEntries([...new Set(results.map((result) => result.finalState))].map((state) => [state, results.filter((result) => result.finalState === state).length])),
    linksFound: results.reduce((sum, result) => sum + (result.metrics?.linksFound || 0), 0),
    linksSampled: results.reduce((sum, result) => sum + (result.metrics?.linksSampled || 0), 0),
    fetchSuccess: results.reduce((sum, result) => sum + (result.metrics?.fetchSuccess || 0), 0),
    fullTextSuccess: results.reduce((sum, result) => sum + (result.metrics?.fullTextSuccess || 0), 0),
    dates: results.reduce((sum, result) => sum + (result.metrics?.dates || 0), 0),
    thumbnails: results.reduce((sum, result) => sum + (result.metrics?.thumbnails || 0), 0),
    languages: results.reduce((sum, result) => sum + (result.metrics?.languages || 0), 0),
    geoSuccess: results.reduce((sum, result) => sum + (result.metrics?.geoSuccess || 0), 0),
    relevant: results.reduce((sum, result) => sum + (result.metrics?.relevant || 0), 0),
    averageSourceMs: results.length ? Math.round(results.reduce((sum, result) => sum + (result.durationMs || 0), 0) / results.length) : 0,
    p95SourceMs: results.length ? results.map((result) => result.durationMs || 0).sort((a, b) => a - b)[Math.min(results.length - 1, Math.ceil(results.length * 0.95) - 1)] : 0,
    auditInput: path.basename(auditPath), checkpoint: checkpointPath
  };
  const summaryPath = path.join(targetDir, `${batch}-summary.json`);
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
