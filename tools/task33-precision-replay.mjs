import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRejectionReasons } from "../src/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = process.env.TASK33_BASELINE_REPORT ||
  "C:\\Users\\pc\\Documents\\live-run-36879286109\\news-run-report-36879286109\\runs\\news-run-2026-10-01T15-55-46-796Z.json";
const outputDir = path.join(repoRoot, "reports", "source-audits", "task33");

const report = JSON.parse(await fs.readFile(inputPath, "utf8"));
const posted = Array.isArray(report.posted) ? report.posted : [];
const urlCounts = new Map();
for (const row of posted) {
  urlCounts.set(row.newsLink, (urlCounts.get(row.newsLink) || 0) + 1);
}

function csv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function classify(row) {
  const trace = row.trace || {};
  const title = String(row.title || "");
  const body = String(row.articleTextExcerpt || "");
  const genericTransport = /\b(?:vande bharat|train service|railway control|flight operations|airline service|passenger|bus service|metro timetable|luggage locker)\b/i.test(title);
  const hasBody = trace.fullArticleFetch === "success" || row.fullArticleRead === true;
  const duplicateUrl = (urlCounts.get(row.newsLink) || 0) > 1;

  if (duplicateUrl && !hasBody) return "INVALID_EXTRA_CITY";
  if (genericTransport && !/\b(?:property|real estate|realty|housing|residential|commercial|land|township|development project)\b/i.test(`${title} ${row.description} ${body}`)) {
    return "SHOULD_REJECT";
  }
  if (!hasBody && trace.sourceType !== "OFFICIAL_AUTHORITATIVE") return "SHOULD_REVIEW";
  if (duplicateUrl) return "VALID_MULTI_CITY";
  return hasBody ? "VALID_AUTO_PUBLISH" : "SHOULD_REVIEW";
}

const rows = posted.map((row) => {
  const trace = row.trace || {};
  const article = {
    ...row,
    newsLink: row.newsLink,
    sourceUrl: row.sourceUrl,
    articleText: row.articleTextExcerpt || "",
    articleReadAttempted: trace.fullArticleFetch !== "not-attempted",
    fullArticleRead: row.fullArticleRead === true,
    cityCode: row.cityCode || ""
  };
  return {
    url: row.newsLink,
    source: row.sourceName || row.postedBy || "",
    title: row.title,
    city: row.cityCode,
    fullArticleRead: row.fullArticleRead === true ? "YES" : "NO",
    bodyChars: article.articleText.length,
    duplicateCities: [...new Set(posted.filter((item) => item.newsLink === row.newsLink).map((item) => item.cityCode))].join(","),
    category: classify(row),
    patchedReasons: getRejectionReasons(article, new Set()).join(" | ")
  };
});

const counts = Object.fromEntries(["VALID_AUTO_PUBLISH", "SHOULD_REVIEW", "SHOULD_REJECT", "VALID_MULTI_CITY", "INVALID_EXTRA_CITY"].map((key) => [key, rows.filter((row) => row.category === key).length]));
const uniqueUrls = new Set(posted.map((row) => row.newsLink)).size;
const fullArticleVerified = rows.filter((row) => row.fullArticleRead === "YES").length;
const replay = {
  baselineRunId: "36879286109",
  generatedAt: new Date().toISOString(),
  previouslyPublished: posted.length,
  uniqueUrls,
  fullArticleVerified,
  feedOrListingOnly: posted.length - fullArticleVerified,
  stillAutoPublish: counts.VALID_AUTO_PUBLISH,
  movedToReview: counts.SHOULD_REVIEW,
  wouldReject: counts.SHOULD_REJECT,
  multiCityValidated: counts.VALID_MULTI_CITY,
  extraCityRecordsSuppressed: counts.INVALID_EXTRA_CITY,
  counts,
  rows
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "task33-production-replay.json"), `${JSON.stringify(replay, null, 2)}\n`);
const header = ["URL", "SOURCE", "TITLE", "CITY", "FULL_ARTICLE_READ", "BODY_CHARS", "DUPLICATE_CITIES", "ASSESSMENT", "PATCHED_REASONS"];
const csvRows = [header, ...rows.map((row) => [row.url, row.source, row.title, row.city, row.fullArticleRead, row.bodyChars, row.duplicateCities, row.category, row.patchedReasons])].map((row) => row.map(csv).join(","));
await fs.writeFile(path.join(outputDir, "task33-production-audit.csv"), `${csvRows.join("\n")}\n`);
const markdown = [
  "# Task 33 production precision replay",
  "",
  `Baseline run: 36879286109`,
  `Previously published records: ${posted.length}`,
  `Unique URLs: ${uniqueUrls}`,
  `Full-article verified: ${fullArticleVerified}`,
  `Feed/listing-only: ${posted.length - fullArticleVerified}`,
  "",
  "## Replay summary",
  "",
  ...Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "The replay is local-only and does not call the production API or mutate sent state.",
  ""
];
await fs.writeFile(path.join(outputDir, "task33-production-replay.md"), `${markdown.join("\n")}\n`);
console.log(JSON.stringify(replay, null, 2));
