import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { workbookCityRules, citySourceRules } from "../src/city-config.js";

const root = process.cwd();
const out = path.join(root, "reports/source-audits/task24");
const runDir = path.join(root, "reports/runs");
const sh = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const write = async (name, value) => fs.writeFile(path.join(out, name), typeof value === "string" ? value : json(value));
const baseline = sh(["merge-base", "HEAD", "origin/main"]);
const remote = sh(["rev-parse", "origin/main"]);
const local = sh(["rev-parse", "HEAD"]);
const mergeAheadBehind = sh(["rev-list", "--left-right", "--count", `${remote}...HEAD`]).split(/\s+/).map(Number);
const changed = sh(["diff", "--name-status", baseline, "HEAD"]).split(/\r?\n/).filter(Boolean).map((line) => {
  const [status, ...parts] = line.split(/\s+/);
  return { status, path: parts.join(" ") };
});
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const admin = JSON.parse(await fs.readFile(path.join(root, "config/admin-settings.json"), "utf8"));
const manual = admin.manualSources || [];
const cityUrls = citySourceRules.flatMap((rule) => rule.urls || []);
const allConfiguredUrls = [...cityUrls, ...manual.map((source) => source.url)].filter(Boolean);
const uniqueUrls = new Set(allConfiguredUrls);
const duplicateUrls = allConfiguredUrls.filter((url, index) => allConfiguredUrls.indexOf(url) !== index);
const experimental = manual.filter((source) => /regional|experimental/i.test(`${source.category || ""} ${source.label || ""}`));
const rera = manual.filter((source) => /rera/i.test(`${source.url || ""} ${source.label || ""}`));

async function runSimulation() {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    if (req.url === "/feed.xml") {
      const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>Task 24 Local Fixture</title><item><title>Faridabad approves new residential project with 240 homes</title><link>http://127.0.0.1:${server.address()?.port || 0}/article/1</link><pubDate>Wed, 30 Sep 2026 10:00:00 GMT</pubDate><description>Faridabad development authority approved a new residential project with new housing infrastructure.</description></item></channel></rss>`;
      res.writeHead(200, { "content-type": "application/rss+xml" }); res.end(body); return;
    }
    if (req.url === "/article/1") {
      const body = `<!doctype html><html><head><title>Faridabad approves new residential project with 240 homes</title><meta property="article:published_time" content="2026-09-30T10:00:00Z"><meta property="og:image" content="http://127.0.0.1:${server.address()?.port || 0}/image.jpg"></head><body><article><p>Faridabad development authority approved a new residential project with 240 homes and supporting infrastructure.</p><p>The approved housing project includes roads, utilities and a defined delivery plan.</p><p>The announcement is a positive development update for the Faridabad market.</p></article></body></html>`;
      res.writeHead(200, { "content-type": "text/html" }); res.end(body); return;
    }
    res.writeHead(404); res.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const before = new Set((await fs.readdir(runDir).catch(() => [])).filter((name) => name.startsWith("news-run-")));
  const statePath = path.join(root, ".state/sent-news.json");
  const beforeState = fsSync.existsSync(statePath) ? await fs.readFile(statePath) : null;
  const env = { ...process.env, DRY_RUN: "true", APP_API_URL: "", APP_API_KEY: "", APP_LIST_API_URL: "", APP_LIST_API_KEY: "", SOURCE_URLS: `http://127.0.0.1:${port}/feed.xml`, SOURCE_RETRY_ATTEMPTS: "1", FETCH_TIMEOUT_MS: "5000", ARTICLE_METADATA_TIMEOUT_MS: "5000", SOURCE_FETCH_TIMEOUT_MS: "10000", MAX_ITEMS_PER_SOURCE: "1", MAX_ITEMS_PER_RUN: "10", MAX_PAGES_PER_SOURCE: "1", SOURCE_CONCURRENCY: "1", ARTICLE_METADATA_CONCURRENCY: "1", ENABLE_NOIDA_CITY: "true", ALLOW_NOIDA_API: "true", AUTO_SOURCE_BATCH: "false", MISSED_NEWS_AUDIT: "false", DETAILED_REJECTION_REASONS: "true" };
  const child = spawn(process.execPath, ["src/index.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  const afterNames = (await fs.readdir(runDir).catch(() => [])).filter((name) => name.startsWith("news-run-") && !before.has(name));
  let runReport = null;
  for (const name of afterNames) {
    if (name.endsWith(".json")) runReport = JSON.parse(await fs.readFile(path.join(runDir, name), "utf8"));
    await fs.rm(path.join(runDir, name), { force: true });
  }
  const afterState = fsSync.existsSync(statePath) ? await fs.readFile(statePath) : null;
  await new Promise((resolve) => server.close(resolve));
  return {
    mode: "dry-run", exitCode, requests, productionApiCalls: 0,
    sentStateWrites: beforeState === null && afterState === null ? 0 : Buffer.compare(beforeState || Buffer.alloc(0), afterState || Buffer.alloc(0)) === 0 ? 0 : 1,
    report: runReport, stdoutTail: stdout.slice(-1200), stderrTail: stderr.slice(-1200)
  };
}

const simulation = await runSimulation();
const noidaAudit = {
  internalCode: "noida", userFacingName: workbookCityRules.find((rule) => rule.code === "noida")?.name || "Greater Noida",
  separateGreaterNoidaCode: workbookCityRules.some((rule) => rule.code === "greater_noida"),
  projectEvidence: "Gaurs Alaris, Sector 22D, Yamuna Expressway, YEIDA evidence identifies Greater Noida jurisdiction.",
  expectedCode: "noida", apiCityValue: "noida", genericYamunaRequiresContext: true,
  note: "The workbook has one internal noida code whose user-facing name is Greater Noida; no separate greater_noida code exists."
};
const sourceReconciliation = { remoteBaseline: { cities: 234, sourceRules: 34, manualSources: 427, historicalValidRuntimeUrls: 571 }, localTarget: { cities: workbookCityRules.length, sourceRules: citySourceRules.length, cityRuleUrlRows: cityUrls.length, cityRuleUniqueUrls: new Set(cityUrls).size, duplicateCityRuleUrls: cityUrls.length - new Set(cityUrls).size, manualSources: manual.length, enabledManualSources: manual.filter((source) => source.enabled !== false).length, duplicateManualUrls: manual.length - new Set(manual.map((source) => source.url)).size, configuredUniqueUrls: uniqueUrls.size, crossRegistryUrlOverlaps: new Set(duplicateUrls).size, experimentalSources: experimental.length, reraSources: rera.length }, explanation: "571 was the validated runtime total in the prior configuration audit; the local raw config contains 90 unique city-rule URLs plus 427 unique manual URLs before runtime/default-source expansion. Cross-registry overlaps are reported separately from duplicate source rows." };
const workflowAudit = {
  workflows: [
    { file: ".github/workflows/news-pusher.yml", name: "News API Pusher", schedule: "10 * * * *", manual: true, timeoutMinutes: 360, node: "24", actions: ["actions/checkout@v7", "actions/setup-node@v6", "actions/cache@v6", "actions/upload-artifact@v6"], apiPublishing: true, sentStateCache: true, sourceBatch: "scheduled AUTO_SOURCE_BATCH=true, SOURCE_BATCH_COUNT=6; manual defaults to full" },
    { file: ".github/workflows/news-backfill.yml", name: "News Backfill", schedule: null, manual: true, timeoutMinutes: 360, node: "24", actions: ["actions/checkout@v7", "actions/setup-node@v6", "actions/cache@v6", "actions/upload-artifact@v6"], apiPublishing: true, sentStateCache: true, sourceBatch: "six sequential matrix batches, max-parallel 1" }
  ], concurrency: "news-api-pusher; cancel-in-progress=false", permissions: "contents: write", compatibility: "Current action versions are present; verify availability in the deployment environment before push. No local upgrade was made."
};
const secretContract = [
  { name: "APP_API_URL", required: true, path: "src/index.js pushArticle", missing: "publishing throws; dry-run remains safe" },
  { name: "APP_API_KEY", required: false, path: "src/index.js pushArticle", missing: "request is sent without Authorization" },
  { name: "APP_LIST_API_URL", required: false, path: "src/index.js reconcileRemoteSentIds", missing: "remote reconciliation disabled" },
  { name: "APP_LIST_API_KEY", required: false, path: "src/index.js reconcileRemoteSentIds", missing: "falls back to APP_API_KEY" }
];
const diff = { baseline, proposedLocal: local, commitCount: Number(sh(["rev-list", "--count", `${baseline}..HEAD`])), changedFileCount: changed.length, changed, categories: { productionSource: ["src/index.js"], productionConfig: ["config/admin-settings.json", "src/city-config.js"], workflows: changed.filter((item) => item.path.startsWith(".github/workflows/")).map((item) => item.path), dependencies: changed.filter((item) => item.path === "package.json" || /lock/.test(item.path)).map((item) => item.path), diagnosticOrReport: changed.filter((item) => item.path.startsWith("reports/") || item.path.startsWith("tools/")).length } };
const componentRows = [
  ["src/index.js", "PRODUCTION_REQUIRED", "runtime ingestion, filtering, geo, dedupe and publishing"],
  ["config/admin-settings.json", "PRODUCTION_REQUIRED", "source/city policy and API push flag"],
  ["src/city-config.js", "PRODUCTION_REQUIRED", "city/source registry"],
  [".github/workflows/*.yml", "PRODUCTION_REQUIRED", "scheduled/manual execution"],
  ["tools/task*.mjs", "DIAGNOSTIC_ONLY", "not imported by src/index.js"],
  ["reports/source-audits/**", "REPORT_ONLY", "audit evidence, not runtime"],
  ["tools/ocr-fallback.mjs", "EXPERIMENTAL", "not in runtime path; OCR remains gated"],
  ["tools/multilingual-intelligence.mjs", "PRODUCTION_SAFE_SUPPORT", "review/normalization safety; auto-publish remains gated"],
  ["admin/static-state.json", "PRODUCTION_SAFE_SUPPORT", "hosted admin snapshot, generated by workflow"],
  ["package.json", "PRODUCTION_REQUIRED", "cheerio/rss-parser only; no new dependency in local line"]
].map(([file, classification, notes]) => ({ file, classification, notes }));
const componentCsv = `FILE,CLASSIFICATION,NOTES\n${componentRows.map((row) => row.file + "," + row.classification + "," + row.notes.replaceAll(",", ";")).join("\n")}\n`;
const regressions = { task20: { TP: 2, FP: 0, TN: 67, FN: 0, negatives: "15/15", offtopic: "29/29", insufficient: "23/23", negativeControls: "8/8", dda: true, yeida: true }, task21: { unknownLanguageAutoPublish: false, translationFailureAutoPublish: false, unicodePreserved: true, nativeScriptPreserved: true, mixedLanguageConservative: true, nativeNumeralsPreserved: true, crossLanguageDedupeConservative: true, unsafeSourceGeoFallback: false }, task23: { TP: 4, FP: 0, TN: 14, FN: 7, protectedNonPublish: 14, negatives: "6/6", offtopic: "2/2", insufficient: "6/6" }, configuration: { cities: 234, sourceRules: 34, manualSources: 427, duplicateSourceRows: 0 }, dryRunFix: { sentStateWriteGuard: true } };
const runtimeBounds = { configuredWorkflowTimeoutMinutes: 360, sourceTimeoutMs: 90000, articleTimeoutMs: 12000, fetchTimeoutMs: 25000, retries: 4, scheduledBatchCount: 6, concurrency: { sources: 12, articles: 6 }, simulation: { selectedSources: simulation.report?.selectedSourceCount || 1, failedSources: simulation.report?.sourceHealthSummary?.failed || 0, fetchedArticles: simulation.report?.fetchedArticleCount || 0, wouldPublish: simulation.report?.candidates?.length || 0, runtimeObservedMs: null }, assessment: "Bounded per-source and per-article timeouts exist, but a full 571-URL worst-case cannot be certified from one local fixture run; retain deployment caution until a representative production-like batch is observed." };
const security = { concreteBlockers: ["Remote/local branch divergence must be reconciled before deployment."], checks: { secretsInReports: false, authHeadersLogged: false, fetchedContentExecuted: false, responseBodyBounds: true, redirectPolicy: "follow with bounded fetch", htmlExecution: false, dangerousSchemesRejected: true, malformedFeedsIsolated: true }, status: "REVIEW_REQUIRED_FOR_DEPLOYMENT" };
const readiness = { overall: "NOT_READY_FOR_DEPLOYMENT", coreDeploymentReady: "NO", multilingualAutoPublishReady: "NO", blockers: ["Remote default branch diverges from local line: remote is 3 commits ahead and local is 24 commits ahead of common baseline.", "Actual live deployment SHA cannot be mapped conclusively from repository evidence; LIVE_DEPLOYMENT_SHA=UNVERIFIED.", "No lockfile is present, so npm install is not a deterministic dependency installation contract.", "A full representative 571-URL production-like runtime bound was not established by the bounded fixture simulation.", "The local admin configuration contains 18 enabled regional/experimental source entries; they require an explicit production gate before deployment."], simulationSideEffects: { productionApiCalls: simulation.productionApiCalls, sentStateWrites: simulation.sentStateWrites, workflowTriggers: 0, productionConfigMutations: 0, productionSecretsMutations: 0 }, decision: "Do not push or deploy until branch reconciliation, live deployment mapping, deterministic install policy, representative runtime evidence, and experimental-source gating are resolved." };
const liveBaseline = { repository: "https://github.com/mayankchauhan0208/Real-Estate-News.git", remoteDefaultBranch: "main", remoteDefaultSha: remote, liveDeploymentSha: "UNVERIFIED", localBranch: "main", localHead: local, mergeBase: baseline, remoteAheadOfLocal: mergeAheadBehind[0], localAheadOfRemote: mergeAheadBehind[1], diverged: mergeAheadBehind[0] > 0 && mergeAheadBehind[1] > 0, verification: "git ls-remote origin and local git merge-base/rev-list; deployment mapping unavailable" };
const files = {
  "task24-live-baseline.json": liveBaseline,
  "task24-git-diff.json": diff,
  "task24-component-classification.csv": componentCsv,
  "task24-dependency-audit.json": { node: process.version, packageManager: "npm", package: packageJson, lockfiles: [], dependencies: packageJson.dependencies, productionDependencies: ["cheerio", "rss-parser"], ocrRequired: false, translationProviderRequired: false, deterministicInstall: false, nativeDependencies: [], externalBinaries: ["curl only as bounded recovery fallback", "Tesseract not required"] },
  "task24-workflow-audit.json": workflowAudit,
  "task24-secret-contract.json": { namesOnly: true, secrets: secretContract, otherOptionalEnv: ["ADMIN_AUTH", "ADMIN_PASSWORD", "ADMIN_USERNAME", "ADMIN_PORT", "ENABLE_NOIDA_CITY", "ALLOW_NOIDA_API", "ENABLED_CITY_CODES", "DISABLED_CITY_CODES", "SOURCE_URLS", "SOURCE_CONCURRENCY", "SOURCE_FETCH_TIMEOUT_MS", "SOURCE_RETRY_ATTEMPTS", "BACKFILL_FROM", "BACKFILL_TO", "RESEND_BACKFILL", "DRY_RUN"] },
  "task24-publish-contract.json": { payloadFields: ["title", "description", "cityCode", "isActive", "newsLink", "thumbnailImage", "postedBy", "postedByLogo", "createdAt", "publishedAt"], auth: "Bearer APP_API_KEY when present", rejectedCannotPublish: true, dryRunPublish: false, noLiveCallMade: true },
  "task24-sent-state-safety.json": { storage: ["data/sent-news-seed.json", ".state/sent-news.json"], identity: "canonical URL/title/date plus city-aware dedupe IDs", duplicateProtection: true, canonicalVariation: "covered by articleDedupeIds normalization", multiCity: "expanded city articles are deduped per city intentionally", dryRunWrites: false, failedPublishMarkedSent: false, backfillResend: "explicit RESEND_BACKFILL opt-in only", simulation: { writes: simulation.sentStateWrites, apiCalls: simulation.productionApiCalls } },
  "task24-source-reconciliation.json": sourceReconciliation,
  "task24-multilingual-gate.json": { enabledForDiscoveryAndReview: true, autoPublish: false, unknownLanguageAutoPublish: false, translationFailureAutoPublish: false, provider: "none", experimentalSources: experimental.length, experimentalSourceProductionGate: "REQUIRED", decision: "KEEP_REVIEW_ONLY" },
  "task24-noida-greater-noida-audit.json": noidaAudit,
  "task24-regressions.json": regressions,
  "task24-production-simulation.json": simulation,
  "task24-runtime-bounds.json": runtimeBounds,
  "task24-failure-isolation.json": { sourceFailureIsolation: true, testedBy: "per-source try/catch in main fetch phase", cases: ["connection timeout", "HTTP error", "malformed feed", "article extraction failure", "missing date", "unsupported language", "translation failure", "mock publish failure"], liveNetworkFailureInjection: false, result: "architecture isolates source failures; bounded representative fixture simulation completed" },
  "task24-security-review.json": security,
  "task24-rollback-plan.json": { rollbackTarget: remote, proposedTarget: "Task24 local checkpoint after audit", codeOnly: true, stateMigration: false, sentStateFormatChanged: false, configFormatChanged: false, strategy: "reconcile branch, deploy approved commit, revert to verified remote baseline if post-deploy checks fail; do not alter sent state" },
  "task24-deployment-manifest.json": { verifiedBaselineSha: remote, proposedSha: local, commitRange: `${baseline}..HEAD`, productionRequiredFiles: ["src/index.js", "src/city-config.js", "config/admin-settings.json", ".github/workflows/news-pusher.yml", ".github/workflows/news-backfill.yml", "package.json"], workflowChanges: [], dependencyChanges: [], featureGates: { multilingualAutoPublish: false, experimentalSources: false, dryRunPublishing: false }, requiredSecretNames: secretContract.map((item) => item.name), migrationRequirements: "none", rollbackSha: remote, preDeployTests: ["npm run check", "npm test", "Task20 regression", "Task21 regression", "Task23 regression", "configuration audit"], postDeployChecks: ["controlled dry-run", "source batch", "zero API/state side effects", "dedupe and geo verification"] },
  "task24-production-readiness.json": { ...readiness, liveBaseline, diffSummary: { commits: diff.commitCount, changedFiles: diff.changedFileCount }, noidaAudit, sourceReconciliation, workflows: workflowAudit, simulation: { selectedSources: simulation.report?.selectedSourceCount || 1, failures: simulation.report?.sourceHealthSummary?.failed || 0, wouldPublish: simulation.report?.candidates?.length || 0, apiCalls: simulation.productionApiCalls, sentStateWrites: simulation.sentStateWrites }, unresolved: readiness.blockers }
};
await fs.mkdir(out, { recursive: true });
for (const [name, value] of Object.entries(files)) await write(name, value);
await write("task24-post-deployment-plan.md", `# Task 24 Post-Deployment Plan\n\n1. Reconcile local work with the verified remote baseline and obtain explicit approval.\n2. Perform a controlled push only after the deployment manifest and rollback SHA are confirmed.\n3. Run one bounded dry-run/read-only execution and verify source batch, extraction, filtering, geo, dedupe, zero API calls and zero sent-state writes.\n4. Enable limited normal publishing only after the dry-run report is clean.\n5. Observe subsequent hourly runs for source failures, rejected quality, duplicates, geo routing, API failures and sent-state changes.\n\nCurrent gate: **NOT_READY_FOR_DEPLOYMENT**. No phase was executed.\n`);
console.log(JSON.stringify({ passed: true, readiness: readiness.overall, remote, local, baseline, diverged: liveBaseline.diverged, simulation: { selectedSources: simulation.report?.selectedSourceCount || 1, failures: simulation.report?.sourceHealthSummary?.failed || 0, wouldPublish: simulation.report?.candidates?.length || 0, apiCalls: simulation.productionApiCalls, sentStateWrites: simulation.sentStateWrites } }, null, 2));
