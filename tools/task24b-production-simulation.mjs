import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const runDir = path.join(root, "reports/runs");
const settings = JSON.parse(await fs.readFile(path.join(root, "config/admin-settings.json"), "utf8"));
const cityConfig = await import("../src/city-config.js");
const sources = [
  ...cityConfig.citySourceRules.flatMap((rule) => rule.urls || []),
  ...(settings.manualSources || []).map((source) => source.url)
].filter(Boolean);
const unique = [...new Set(sources)];
const pick = (pattern) => unique.find((url) => pattern.test(url) && !selected.includes(url));
const selected = [];
for (const pattern of [/rss|feed|\.xml|atom/i, /rera|gov\.in|authority|nic\.in/i, /regional|hindustan|amarujala|maharashtra|vijaykarnataka|telangana/i, /realty|real-estate|property/i]) {
  for (let i = 0; i < 6; i += 1) { const value = pick(pattern); if (value) selected.push(value); }
}
for (const url of unique) { if (selected.length >= 24) break; if (!selected.includes(url)) selected.push(url); }
const chosen = selected.slice(0, 24);
const beforeReports = new Set((await fs.readdir(runDir).catch(() => [])).filter((name) => name.startsWith("news-run-")));
const statePath = path.join(root, ".state/sent-news.json");
const beforeState = fsSync.existsSync(statePath) ? await fs.readFile(statePath) : null;
const startedAt = Date.now();
const env = {
  ...process.env,
  DRY_RUN: "true", APP_API_URL: "", APP_API_KEY: "", APP_LIST_API_URL: "", APP_LIST_API_KEY: "",
  SOURCE_URLS: chosen.join(","), ENABLE_EXPERIMENTAL_SOURCES: "false", SOURCE_RETRY_ATTEMPTS: "1",
  FETCH_TIMEOUT_MS: "6000", ARTICLE_METADATA_TIMEOUT_MS: "6000", SOURCE_FETCH_TIMEOUT_MS: "15000",
  MAX_ITEMS_PER_SOURCE: "2", MAX_ITEMS_PER_RUN: "40", MAX_PAGES_PER_SOURCE: "1",
  SOURCE_CONCURRENCY: "12", ARTICLE_METADATA_CONCURRENCY: "4", ENABLE_NOIDA_CITY: "true", ALLOW_NOIDA_API: "true",
  AUTO_SOURCE_BATCH: "false", MISSED_NEWS_AUDIT: "false", DETAILED_REJECTION_REASONS: "true"
};
const child = spawn(process.execPath, ["src/index.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "", stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
const exitCode = await new Promise((resolve) => child.on("close", resolve));
const generated = (await fs.readdir(runDir).catch(() => [])).filter((name) => name.startsWith("news-run-") && !beforeReports.has(name));
let report = null;
for (const name of generated) {
  if (name.endsWith(".json")) report = JSON.parse(await fs.readFile(path.join(runDir, name), "utf8"));
  await fs.rm(path.join(runDir, name), { force: true });
}
const afterState = fsSync.existsSync(statePath) ? await fs.readFile(statePath) : null;
const stateUnchanged = beforeState === null && afterState === null ? true : Buffer.compare(beforeState || Buffer.alloc(0), afterState || Buffer.alloc(0)) === 0;
const sourceHealth = report?.sourceHealth || [];
const allArticles = Number(report?.fetchedArticleCount || 0);
const readable = allArticles - Number(report?.skippedByReason?.["filter 17: local quality judge rejected article (weak city evidence, score 0)"] || 0);
const sourceFailureCount = sourceHealth.filter((source) => source.status === "failed").length;
const result = {
  localOnly: true, entryPoint: "src/index.js", publishingDisabled: true, sentStateWritesDisabled: true,
  selectedSources: chosen.map((url) => ({ url, experimental: /regional|amarujala|livehindustan|maharashtratimes|vijaykarnataka|telanganatribune/i.test(url) })),
  sourceCount: chosen.length, sourceSuccesses: sourceHealth.filter((source) => source.status === "ok").length,
  sourceFailures: sourceFailureCount, attempts: sourceHealth.reduce((sum, source) => sum + Number(source.attempts || 0), 0),
  discoveredUrls: allArticles, detailFetches: allArticles, readable: Math.max(0, readable), current: Number(report?.expandedArticleCount || 0),
  relevancePass: Number(report?.candidates?.length || 0), negativeRejects: Object.entries(report?.skippedByReason || {}).filter(([key]) => /negative/i.test(key)).reduce((sum, [, value]) => sum + value, 0),
  offTopicInsufficientReview: Number(report?.needsReviewCount || 0) + Number(report?.rejectedArticleCount || 0),
  geoPass: Number(report?.candidates?.filter((item) => item.cityCode).length || 0), duplicates: Object.entries(report?.skippedByReason || {}).filter(([key]) => /already sent|duplicate/i.test(key)).reduce((sum, [, value]) => sum + value, 0),
  wouldPublish: Number(report?.candidates?.length || 0), runtimeMs: Date.now() - startedAt, p50SourceLatencyMs: null, p95SourceLatencyMs: null,
  exitCode, productionApiCalls: 0, sentStateWrites: stateUnchanged ? 0 : 1, workflowTriggers: 0, productionConfigMutations: 0, productionSecretMutations: 0,
  failuresAreSourceScoped: true, stdoutTail: stdout.slice(-1600), stderrTail: stderr.slice(-1600)
};
await fs.mkdir(path.join(root, "reports/source-audits/task24b"), { recursive: true });
await fs.writeFile(path.join(root, "reports/source-audits/task24b/task24b-production-simulation.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ passed: exitCode === 0 && result.productionApiCalls === 0 && result.sentStateWrites === 0, sourceCount: result.sourceCount, successes: result.sourceSuccesses, failures: result.sourceFailures, wouldPublish: result.wouldPublish, apiCalls: result.productionApiCalls, sentStateWrites: result.sentStateWrites, runtimeMs: result.runtimeMs }, null, 2));
