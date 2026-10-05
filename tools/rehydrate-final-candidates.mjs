import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

const reportRoot = "reports/task45-full-final-resume6/runs";
const reportName = (await fs.readdir(reportRoot)).find((name) => name.startsWith("news-run-") && name.endsWith(".json"));
if (!reportName) throw new Error("Final qualification report not found");
const report = JSON.parse(await fs.readFile(path.join(reportRoot, reportName), "utf8"));
const candidates = report.dryRunCandidates || [];
if (candidates.length !== 42) throw new Error(`Expected 42 candidates, found ${candidates.length}`);

const outputDir = "reports/task45-candidate-rehydration";
await fs.mkdir(outputDir, { recursive: true });
const timeoutMs = 25_000;
const headers = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-IN,en;q=0.9,hi;q=0.8"
};

function first(values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function extract(html, url) {
  const $ = cheerio.load(html);
  const jsonLd = [];
  $("script[type='application/ld+json']").each((_, node) => {
    try {
      const parsed = JSON.parse($(node).text());
      jsonLd.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {}
  });
  const article = jsonLd.find((item) => /article|news/i.test(String(item?.["@type"] || ""))) || {};
  const body = first([
    article.articleBody,
    $("[itemprop='articleBody']").text(),
    $("article").text(),
    $("main").text()
  ]).replace(/\s+/g, " ").trim();
  const title = first([article.headline, $("meta[property='og:title']").attr("content"), $("title").text()]);
  const publishedAt = first([
    article.datePublished,
    $("meta[property='article:published_time']").attr("content"),
    $("meta[itemprop='datePublished']").attr("content")
  ]);
  const description = first([article.description, $("meta[name='description']").attr("content"), $("meta[property='og:description']").attr("content")]);
  const canonicalUrl = first([$("link[rel='canonical']").attr("href"), $("meta[property='og:url']").attr("content"), url]);
  const imageUrl = first([article.image?.url, $("meta[property='og:image']").attr("content")]);
  return { canonicalUrl, title, description, publishedAt, imageUrl, articleText: body, articleTextLength: body.length, extractionMethod: article.articleBody ? "JSON_LD_ARTICLE_BODY" : "HTML_ARTICLE_OR_MAIN" };
}

async function rehydrate(candidate, index) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(candidate.newsLink, { headers, redirect: "follow", signal: controller.signal });
    const html = await response.text();
    const extracted = response.ok ? extract(html, candidate.newsLink) : {};
    return {
      candidateId: index + 1,
      original: candidate,
      rehydration: {
        requestedUrl: candidate.newsLink,
        finalUrl: response.url,
        status: response.status,
        reachable: response.ok,
        ...extracted,
        fullEvidence: response.ok && extracted.articleTextLength >= 200,
        fetchedAt: new Date().toISOString(),
        error: response.ok ? "" : `HTTP ${response.status}`
      }
    };
  } catch (error) {
    return { candidateId: index + 1, original: candidate, rehydration: { requestedUrl: candidate.newsLink, reachable: false, fullEvidence: false, fetchedAt: new Date().toISOString(), error: String(error?.message || error) } };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (let start = 0; start < candidates.length; start += 4) {
  results.push(...await Promise.all(candidates.slice(start, start + 4).map((candidate, offset) => rehydrate(candidate, start + offset))));
}
await fs.writeFile(path.join(outputDir, "candidate-evidence.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceReport: path.join(reportRoot, reportName),
  candidateCount: candidates.length,
  records: results
}, null, 2));
console.log(JSON.stringify({ candidateCount: results.length, fullEvidence: results.filter((record) => record.rehydration.fullEvidence).length, incomplete: results.filter((record) => !record.rehydration.fullEvidence).length, output: path.join(outputDir, "candidate-evidence.json") }, null, 2));
