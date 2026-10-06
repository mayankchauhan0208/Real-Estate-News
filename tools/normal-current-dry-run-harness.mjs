import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const reportDir = path.resolve("reports/source-audits/task-normal-mode-repair");
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "brokket-normal-mode-state-"));
const sourceCount = 553;

const server = createServer((request, response) => {
  const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
  response.setHeader("Content-Type", pathname.startsWith("/article/") ? "text/html; charset=utf-8" : "application/rss+xml");
  if (pathname === "/article/mumbai-township") {
    response.end(`<!doctype html><html><head><meta property="article:published_time" content="2026-10-06T04:00:00.000Z"><title>Residential township project approved in Mumbai</title></head><body><article><h1>Residential township project approved in Mumbai</h1><p>A developer received approval for a new residential township project in Mumbai, adding homes and on-site infrastructure to the named development.</p><p>The approved plan covers a defined residential development with new housing inventory, internal roads, community facilities, and supporting services. The project is located in Mumbai and the approval permits the developer to proceed with the planned construction and delivery of homes.</p><p>This local verification article contains sufficient full-body evidence for the normal current-news pipeline, including the named city, residential project, development action, and concrete property outcome.</p></article></body></html>`);
    return;
  }

  const match = pathname.match(/^\/feed-(\d+)\.xml$/);
  const index = match ? Number(match[1]) : -1;
  const item = index === 0
    ? `<item><title>Residential township project approved in Mumbai</title><link>${server.baseUrl}/article/mumbai-township</link><pubDate>Tue, 06 Oct 2026 04:00:00 GMT</pubDate><description>A new residential township project was approved in Mumbai.</description></item>`
    : "";
  response.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Local source ${index}</title>${item}</channel></rss>`);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
server.baseUrl = `http://127.0.0.1:${server.address().port}`;

const sourceUrls = Array.from({ length: sourceCount }, (_, index) => `${server.baseUrl}/feed-${index}.xml`).join(",");
const env = {
  ...process.env,
  RUN_MODE: "NORMAL_CURRENT",
  BACKFILL_MODE: "false",
  BACKFILL_FROM: "",
  BACKFILL_TO: "",
  DEFAULT_LOOKBACK_DAYS: "20",
  SOURCE_URLS: sourceUrls,
  USE_RESUMABLE_SOURCE_SCHEDULER: "true",
  AUTO_SOURCE_BATCH: "false",
  SOURCE_CONCURRENCY: "12",
  SOURCE_SHARD_SIZE: "50",
  SOURCE_RUNTIME_BUDGET_MS: "1800000",
  SOURCE_CLEANUP_RESERVE_MS: "480000",
  SOURCE_MAX_SHARDS_PER_RUN: "12",
  SOURCE_RETRY_ATTEMPTS: "1",
  SOURCE_FETCH_TIMEOUT_MS: "5000",
  FETCH_TIMEOUT_MS: "5000",
  ARTICLE_METADATA_TIMEOUT_MS: "5000",
  MAX_ITEMS_PER_SOURCE: "8",
  MAX_PAGES_PER_SOURCE: "1",
  MAX_ITEMS_PER_RUN: "80",
  DRY_RUN: "true",
  APP_API_URL: "",
  APP_API_KEY: "",
  APP_LIST_API_URL: "",
  APP_LIST_API_KEY: "",
  ENABLE_NOIDA_CITY: "false",
  MISSED_NEWS_AUDIT: "false",
  DETAILED_REJECTION_REASONS: "true",
  NEWS_STATE_DIR: stateDir,
  NEWS_RUN_REPORTS_DIR: reportDir,
  BUILD_VERSION: "normal-mode-contract-harness",
  GITHUB_SHA: "local-normal-mode-repair"
};

const child = spawn(process.execPath, ["src/index.js"], {
  cwd: process.cwd(),
  env,
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });
const exitCode = await new Promise((resolve) => child.on("close", resolve));
server.close();
assert.equal(exitCode, 0, output.slice(-5000));

const reportRoot = path.join(reportDir, "runs");
const files = await fs.readdir(reportRoot);
const reportFile = files.filter((file) => file.startsWith("news-run-") && file.endsWith(".json")).sort().at(-1);
assert.ok(reportFile, `normal dry-run report was not written. Output: ${output.slice(-5000)}`);
const reportPath = path.join(reportRoot, reportFile);
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
assert.equal(report.runMode, "NORMAL_CURRENT");
assert.equal(report.backfillMode, false);
assert.equal(report.window.from, "");
assert.equal(report.window.to, "");
assert.equal(report.historicalTraversal, false);
assert.equal(report.backfillStateUsed, false);
assert.equal(report.allSelectedSourceCount, sourceCount);
assert.equal(report.selectedSourceCount, sourceCount);
assert.equal(report.sourceCount, sourceCount);
assert.equal(report.failedSources?.length || 0, 0);
assert.equal(report.fetchedArticleCount, 1);
assert.equal(report.posted?.length || 0, 0);
assert.equal(report.dryRun, true);

console.log(JSON.stringify({
  passed: true,
  selected: report.selectedSourceCount,
  accounted: report.sourceCount,
  pending: 0,
  cycleCompleted: true,
  runMode: report.runMode,
  backfillMode: report.backfillMode,
  backfillStart: report.window.from,
  backfillEnd: report.window.to,
  historicalTraversal: report.historicalTraversal,
  backfillStateUsed: report.backfillStateUsed,
  articlesFetched: report.fetchedArticleCount,
  fullReadable: report.funnelTelemetry?.totals?.fullArticleReadable ?? null,
  fresh: report.funnelTelemetry?.totals?.fresh ?? null,
  relevancePass: report.funnelTelemetry?.totals?.relevancePass ?? report.funnelTelemetry?.totals?.relevance ?? null,
  propertyEventPass: report.funnelTelemetry?.totals?.propertyEventPass ?? null,
  propertyNexusPass: report.funnelTelemetry?.totals?.propertyNexusPass ?? null,
  geoValid: report.funnelTelemetry?.totals?.geoValid ?? null,
  review: report.funnelTelemetry?.totals?.review ?? null,
  wouldPublish: report.candidates?.length || 0,
  apiPosts: report.posted?.length || 0,
  articlePipelineExecuted: report.fetchedArticleCount > 0,
  report: reportPath
}, null, 2));
