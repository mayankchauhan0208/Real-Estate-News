import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".task41-artifacts");
const output = path.resolve(process.argv[3] || "reports/source-audits/task41/backfill-summary.json");

async function filesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(fullPath);
  }
  return files;
}

const reportPaths = (await filesUnder(root))
  .filter((file) => path.basename(file).startsWith("news-run-") &&
    file.split(/[\\/]/).includes("runs"))
  .sort();
const reports = [];
for (const reportPath of reportPaths) {
  try {
    const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
    if (report.window?.from || report.sourceStrategy === "task41-resumable-backfill") {
      reports.push({ reportPath, report });
    }
  } catch {
    // Artifact folders can contain unrelated or partial JSON files.
  }
}

const expectedOffsets = [0, 100, 200, 300, 400, 500];
const offsets = new Set();
const candidateKeys = new Set();
const postedKeys = new Set();
const cityCodes = new Set();
const languages = new Set();
const addArticles = (articles, target) => {
  for (const article of articles || []) {
    const key = [article.cityCode || "", article.newsLink || "", article.title || ""].join("|");
    target.add(key);
    if (article.cityCode) cityCodes.add(article.cityCode);
    const language = article.trace?.language;
    if (language && language !== "not-captured") languages.add(language);
  }
};

let sourcesConsidered = 0;
let sourcesFetched = 0;
let sourceFailures = 0;
let linksDiscovered = 0;
let articlesFetched = 0;
let fullArticles = 0;
let reliableDates = 0;
let insideDateWindow = 0;
let safeCandidates = 0;
let rejected = 0;
let review = 0;
let published = 0;
for (const { reportPath, report } of reports) {
  const artifactSegment = reportPath.split(/[\\/]/).find((segment) => segment.startsWith("task41-backfill-report-"));
  const match = artifactSegment?.match(/-(0|100|200|300|400|500)$/);
  if (match) offsets.add(Number(match[1]));
  sourcesConsidered = Math.max(sourcesConsidered, report.allSelectedSourceCount || 0);
  sourcesFetched += report.sources?.length || 0;
  sourceFailures += report.failures?.length || 0;
  linksDiscovered += (report.sources || []).reduce((sum, source) => sum + Number(source.count || 0), 0);
  articlesFetched += Number(report.fetchedArticleCount || 0);
  fullArticles += (report.candidates || []).filter((article) => article.fullArticleRead).length;
  reliableDates += (report.candidates || []).filter((article) => article.publishedAt).length;
  insideDateWindow += Number(report.expandedArticleCount || 0);
  safeCandidates += Number(report.candidates?.length || 0);
  rejected += Number(report.rejectedArticleCount || 0);
  review += Number(report.needsReviewCount || 0);
  published += Number(report.posted?.length || 0);
  addArticles(report.candidates, candidateKeys);
  addArticles(report.posted, postedKeys);
}

const duplicateCandidates = safeCandidates - candidateKeys.size;
const duplicatePosted = published - postedKeys.size;
const complete = reports.length >= expectedOffsets.length && expectedOffsets.every((offset) => offsets.has(offset));
const summary = {
  generatedAt: new Date().toISOString(),
  complete,
  reportCount: reports.length,
  expectedBatchOffsets: expectedOffsets,
  observedBatchOffsets: [...offsets].sort((a, b) => a - b),
  sourcesConsidered,
  sourcesFetched,
  sourceFailures,
  linksDiscovered,
  articlesFetched,
  fullArticles,
  reliableDates,
  insideDateWindow,
  safeCandidates: candidateKeys.size,
  rejected,
  review,
  published,
  withinBackfillDuplicateGroups: duplicateCandidates,
  withinBackfillDuplicateRecords: duplicateCandidates,
  duplicatePublishedRecords: duplicatePosted,
  cities: [...cityCodes].sort(),
  languages: [...languages].sort(),
  reportFiles: reports.map(({ reportPath }) => path.relative(root, reportPath))
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (!complete) process.exitCode = 2;
