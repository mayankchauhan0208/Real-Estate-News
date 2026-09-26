import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { citySourceRules, workbookCityRules } from "./city-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const adminDir = path.join(rootDir, "admin");
const settingsPath = path.join(rootDir, "config", "admin-settings.json");
const reportsDir = path.join(rootDir, "reports", "runs");
const indexPath = path.join(rootDir, "src", "index.js");

loadLocalEnv();

const port = Number(process.env.ADMIN_PORT || 3000);
const adminAuth = getAdminAuthConfig();

let activeDryRun = null;
let activeDryRunLog = [];

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!fsSync.existsSync(envPath)) return;
  const lines = fsSync.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals <= 0) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function getAdminAuthConfig() {
  const enabled = !["0", "false", "off", "no"].includes(String(process.env.ADMIN_AUTH || "true").trim().toLowerCase());
  const username = String(process.env.ADMIN_USERNAME || "9992713289");
  const password = String(process.env.ADMIN_PASSWORD || "Brokket@12345");
  return {
    enabled,
    username,
    password,
    usingDefaultPassword: !process.env.ADMIN_PASSWORD
  };
}

function isAuthorized(request) {
  if (!adminAuth.enabled) return true;
  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return safeEqual(username, adminAuth.username) && safeEqual(password, adminAuth.password);
  } catch {
    return false;
  }
}

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireAdminAuth(request, response) {
  if (isAuthorized(request)) return true;
  response.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Brokket Live News Admin", charset="UTF-8"',
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end("Admin login required.");
  return false;
}

async function ensureSettings() {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch {
    const settings = normalizeSettings({});
    await saveSettings(settings);
    return settings;
  }
}

function normalizeSettings(settings) {
  return {
    automationEnabled: settings.automationEnabled !== false,
    apiPushEnabled: settings.apiPushEnabled === true,
    allCitiesEnabled: settings.allCitiesEnabled === true,
    enabledCityCodes: normalizeCodeList(settings.enabledCityCodes, ["faridabad", "gurugram", "noida"]),
    disabledCityCodes: normalizeCodeList(settings.disabledCityCodes, []),
    disabledSourceIds: normalizeCodeList(settings.disabledSourceIds, []),
    disabledSourceUrls: normalizeSourceUrlList(settings.disabledSourceUrls, []),
    manualSources: Array.isArray(settings.manualSources) ? settings.manualSources.map(normalizeManualSource) : [],
    lastBackfill: {
      cityCodes: normalizeCodeList(settings.lastBackfill?.cityCodes, []),
      from: String(settings.lastBackfill?.from || ""),
      to: String(settings.lastBackfill?.to || ""),
      resendBackfill: settings.lastBackfill?.resendBackfill === true,
      maxItemsPerSource: Number(settings.lastBackfill?.maxItemsPerSource || 25),
      maxItemsPerRun: Number(settings.lastBackfill?.maxItemsPerRun || 120)
    },
    filterProfile: {
      blockNegativeNews: settings.filterProfile?.blockNegativeNews !== false,
      blockHindiArticles: settings.filterProfile?.blockHindiArticles !== false,
      requireRealEstateSignal: settings.filterProfile?.requireRealEstateSignal !== false,
      requireCitySignal: settings.filterProfile?.requireCitySignal !== false,
      notes: String(
        settings.filterProfile?.notes ||
          "Admin settings are local controls. Live workflow changes still require review before deploy."
      )
    }
  };
}

function normalizeCodeList(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.map((code) => String(code || "").trim().toLowerCase()).filter(Boolean))];
}

function normalizeSourceUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function normalizeSourceUrlList(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.map(normalizeSourceUrl).filter(Boolean))];
}

function normalizeManualSource(source, index = 0) {
  const url = String(source?.url || "").trim();
  return {
    id: String(source?.id || stableId(url || `manual-${index}`)),
    url,
    label: String(source?.label || "").trim(),
    cityCodes: normalizeCodeList(source?.cityCodes, []),
    enabled: source?.enabled !== false,
    category: String(source?.category || "manual").trim() || "manual",
    createdAt: source?.createdAt || new Date().toISOString()
  };
}

async function saveSettings(settings) {
  await fs.writeFile(settingsPath, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`, "utf8");
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

async function serveStatic(response, pathname) {
  const filePath = pathname === "/" ? path.join(adminDir, "index.html") : path.join(adminDir, pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(adminDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(resolved);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(resolved)) || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  } catch {
    sendText(response, 404, "Not found");
  }
}

async function getDashboardState() {
  const settings = await ensureSettings();
  const sources = await getSourceRows(settings);
  const cityRows = getCityRows(settings, sources);
  const reports = await getReportRows();
  const liveCities = cityRows.filter((city) => city.enabled);
  const postedNews = collectPostedNews(reports);
  const candidateNews = collectCandidateNews(reports);
  const needsReviewNews = collectNeedsReviewNews(reports);

  const readiness = buildReadiness(settings, sources, cityRows, reports);

  return {
    generatedAt: new Date().toISOString(),
    settings,
    totals: {
      liveCities: liveCities.length,
      requestedCities: cityRows.length,
      moreRequestedCities: Math.max(0, cityRows.length - liveCities.length),
      sources: sources.length,
      enabledSources: sources.filter((source) => source.enabled).length,
      disabledSources: sources.filter((source) => !source.enabled).length,
      manualSources: settings.manualSources.length,
      reports: reports.length,
      postedNews: postedNews.length,
      candidateNews: candidateNews.length,
      needsReviewNews: needsReviewNews.length
    },
    readiness,
    requestedByState: groupStateCounts(cityRows),
    cities: cityRows,
    sources,
    reports,
    analytics: buildDashboardAnalytics(reports),
    postedNews,
    candidateNews,
    needsReviewNews,
    pushedByDate: summarizePushedByDate(reports),
    dryRun: getDryRunState()
  };
}

function buildReadiness(settings, sources, cityRows, reports) {
  const liveCities = cityRows.filter((city) => city.enabled);
  const duplicateUrls = countDuplicateUrls(sources);
  const enabledSources = sources.filter((source) => source.enabled);
  const hasDryRunReport = reports.some((report) => report.dryRun);
  const latestReport = reports[0] || null;
  const checks = [
    {
      key: "api-safe",
      label: "API push is off",
      ok: settings.apiPushEnabled !== true,
      detail: settings.apiPushEnabled ? "Live API push is enabled." : "Admin and local runs are protected by default."
    },
    {
      key: "cities-live",
      label: "Live cities selected",
      ok: liveCities.length > 0,
      detail: `${liveCities.length} live city${liveCities.length === 1 ? "" : "ies"}.`
    },
    {
      key: "source-quality",
      label: "Sources cleaned",
      ok: enabledSources.length > 0 && duplicateUrls === 0,
      detail: `${enabledSources.length} enabled, ${sources.length - enabledSources.length} disabled, ${duplicateUrls} duplicate URL groups.`
    },
    {
      key: "dry-run-history",
      label: "Dry-run review available",
      ok: hasDryRunReport,
      detail: hasDryRunReport ? "At least one dry-run report exists." : "Run a safe dry-run before enabling API push."
    },
    {
      key: "all-cities-safe",
      label: "All cities guarded",
      ok: settings.allCitiesEnabled !== true,
      detail: settings.allCitiesEnabled ? "All cities are enabled." : "Only selected cities are live."
    }
  ];

  return {
    readyForGit: true,
    readyForApiPush: checks.every((check) => check.ok) && latestReport?.candidateCount > 0,
    duplicateSourceUrlGroups: duplicateUrls,
    disabledSourceUrls: settings.disabledSourceUrls.length,
    latestReportName: latestReport?.name || "",
    checks
  };
}

function countDuplicateUrls(sources) {
  const counts = new Map();
  for (const source of sources) {
    const key = normalizeSourceUrl(source.url);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function getCityRows(settings, sources = []) {
  const enabled = new Set(settings.enabledCityCodes);
  const disabled = new Set(settings.disabledCityCodes);
  const sourceCounts = new Map();
  for (const source of sources) {
    for (const code of source.cityCodes || []) {
      sourceCounts.set(code, (sourceCounts.get(code) || 0) + 1);
    }
  }
  return workbookCityRules.map((city) => ({
    ...city,
    enabled: settings.allCitiesEnabled ? !disabled.has(city.code) : enabled.has(city.code) && !disabled.has(city.code),
    sourceCount: sourceCounts.get(city.code) || 0
  }));
}

async function getSourceRows(settings) {
  const defaultSources = await extractDefaultSources();
  const rows = [];

  for (const source of defaultSources) {
    rows.push({
      id: stableId(source),
      url: source,
      label: inferSourceLabel(source),
      cityCodes: inferCityCodesForSource(source),
      enabled: isSourceEnabled(settings, stableId(source), source),
      category: "default"
    });
  }

  for (const rule of citySourceRules) {
    for (const url of rule.urls) {
      rows.push({
        id: stableId(`${rule.code}:${url}`),
        url,
        label: inferSourceLabel(url),
        cityCodes: [rule.code],
        enabled: isSourceEnabled(settings, stableId(`${rule.code}:${url}`), url),
        category: "city"
      });
    }
  }

  for (const manualSource of settings.manualSources) {
    const normalized = normalizeManualSource(manualSource);
    rows.push({
      ...normalized,
      enabled: normalized.enabled && isSourceEnabled(settings, normalized.id, normalized.url)
    });
  }

  const unique = new Map();
  for (const row of rows) {
    const existing = unique.get(row.url);
    if (!existing) {
      unique.set(row.url, row);
      continue;
    }
    existing.cityCodes = [...new Set([...existing.cityCodes, ...row.cityCodes])].sort();
    existing.enabled = existing.enabled && row.enabled;
    existing.category = existing.category === row.category ? existing.category : "mixed";
  }
  return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label) || a.url.localeCompare(b.url));
}

function isSourceEnabled(settings, id, url) {
  return !settings.disabledSourceIds.includes(String(id || "").toLowerCase()) &&
    !settings.disabledSourceUrls.includes(normalizeSourceUrl(url));
}

async function extractDefaultSources() {
  const text = await fs.readFile(indexPath, "utf8");
  const match = text.match(/const defaultSources = \[([\s\S]*?)\];/);
  if (!match) return [];
  const urls = [];
  const urlPattern = /"([^"]+)"/g;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(match[1]))) urls.push(urlMatch[1]);
  return urls;
}

function inferCityCodesForSource(url) {
  const lower = url.toLowerCase();
  return citySourceRules
    .filter((rule) => rule.urls.some((sourceUrl) => sourceUrl.toLowerCase() === lower))
    .map((rule) => rule.code);
}

function inferSourceLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.split(".").slice(0, -1).join(".") || host;
  } catch {
    return "Manual Source";
  }
}

async function getReportRows() {
  try {
    const names = await fs.readdir(reportsDir);
    const rows = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          const filePath = path.join(reportsDir, name);
          const stat = await fs.stat(filePath);
          const report = JSON.parse(await fs.readFile(filePath, "utf8"));
          const candidates = (report.candidates || report.dryRunCandidates || []).filter(isAdminVisibleCandidate);
          return {
            name,
            generatedAt: report.generatedAt || stat.mtime.toISOString(),
            mode: report.mode || "unknown",
            dryRun: Boolean(report.dryRun),
            sourceCount: report.sourceCount || report.sources?.length || 0,
            fetchedArticleCount: report.fetchedArticleCount || 0,
            expandedArticleCount: report.expandedArticleCount || 0,
            candidateCount: candidates.length,
            postedCount: report.posted?.length || 0,
            rejectedArticleCount: report.rejectedArticleCount ?? sumObjectValues(report.skippedByReason || {}),
            needsReviewCount: report.needsReviewCount ?? report.needsReviewArticles?.length ?? 0,
            failureCount: report.failures?.length || 0,
            candidates,
            posted: report.posted || [],
            rejectedArticles: report.rejectedArticles || [],
            needsReviewArticles: report.needsReviewArticles || [],
            cityBreakdown: report.cityBreakdown || [],
            skippedByReason: report.skippedByReason || {}
          };
        })
    );
    return rows.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  } catch {
    return [];
  }
}

function groupStateCounts(cityRows) {
  const byState = new Map();
  for (const city of cityRows) {
    const row = byState.get(city.state) || {
      state: city.state,
      live: 0,
      requested: 0,
      moreRequested: 0,
      liveCities: [],
      requestedCities: []
    };
    row.requested += 1;
    row.requestedCities.push(city.name);
    if (city.enabled) {
      row.live += 1;
      row.liveCities.push(city.name);
    }
    row.moreRequested = row.requested - row.live;
    byState.set(city.state, row);
  }
  return [...byState.values()].sort((a, b) => b.requested - a.requested || a.state.localeCompare(b.state));
}

function sumObjectValues(value) {
  return Object.values(value || {}).reduce((sum, count) => sum + Number(count || 0), 0);
}

function summarizePushedByDate(reports) {
  const byDate = new Map();
  for (const report of reports) {
    for (const item of report.posted || []) {
      const date = String(item.publishedAt || report.generatedAt || "").slice(0, 10) || "unknown";
      const row = byDate.get(date) || { date, count: 0, cityCounts: {} };
      row.count += 1;
      const city = item.cityCode || "unknown";
      row.cityCounts[city] = (row.cityCounts[city] || 0) + 1;
      byDate.set(date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function buildDashboardAnalytics(reports) {
  const totals = {
    fetched: 0,
    expanded: 0,
    readyToPost: 0,
    posted: 0,
    rejected: 0,
    failedSources: 0,
    needsReview: 0
  };
  const byCity = new Map();
  const rejectionReasons = new Map();

  for (const report of reports) {
    totals.fetched += Number(report.fetchedArticleCount || 0);
    totals.expanded += Number(report.expandedArticleCount || 0);
    totals.readyToPost += Number(report.candidateCount || 0);
    totals.posted += Number(report.postedCount || 0);
    totals.rejected += Number(report.rejectedArticleCount || 0);
    totals.needsReview += Number(report.needsReviewCount || 0);
    totals.failedSources += Number(report.failureCount || 0);

    if (report.cityBreakdown?.length) {
      for (const row of report.cityBreakdown) {
        const cityCode = row.cityCode || "unknown";
        const current = byCity.get(cityCode) || { cityCode, expanded: 0, readyToPost: 0, posted: 0, rejected: 0, rejectionReasons: {} };
        current.expanded += Number(row.expanded || 0);
        current.readyToPost += Number(row.readyToPost || 0);
        current.posted += Number(row.posted || 0);
        current.rejected += Number(row.rejected || 0);
        for (const [reason, count] of Object.entries(row.rejectionReasons || {})) {
          current.rejectionReasons[reason] = (current.rejectionReasons[reason] || 0) + Number(count || 0);
        }
        byCity.set(cityCode, current);
      }
    } else {
      if (report.rejectedArticleCount > 0) {
        const current = byCity.get("unknown") || { cityCode: "unknown", expanded: 0, readyToPost: 0, posted: 0, rejected: 0, rejectionReasons: {} };
        current.rejected += Number(report.rejectedArticleCount || 0);
        byCity.set("unknown", current);
      }
      for (const candidate of report.candidates || []) {
        const cityCode = candidate.cityCode || "unknown";
        const current = byCity.get(cityCode) || { cityCode, expanded: 0, readyToPost: 0, posted: 0, rejected: 0, rejectionReasons: {} };
        current.readyToPost += 1;
        byCity.set(cityCode, current);
      }
      for (const posted of report.posted || []) {
        const cityCode = posted.cityCode || "unknown";
        const current = byCity.get(cityCode) || { cityCode, expanded: 0, readyToPost: 0, posted: 0, rejected: 0, rejectionReasons: {} };
        current.posted += 1;
        byCity.set(cityCode, current);
      }
    }

    for (const [reason, count] of Object.entries(report.skippedByReason || {})) {
      rejectionReasons.set(reason, (rejectionReasons.get(reason) || 0) + Number(count || 0));
    }
  }

  return {
    totals,
    byCity: [...byCity.values()].sort((a, b) => (b.readyToPost + b.posted + b.rejected) - (a.readyToPost + a.posted + a.rejected)),
    rejectionReasons: [...rejectionReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
  };
}

function collectPostedNews(reports) {
  return reports
    .flatMap((report) =>
      (report.posted || []).map((item) => ({
        ...item,
        reportName: report.name,
        reportGeneratedAt: report.generatedAt,
        dryRun: report.dryRun
      }))
    )
    .sort((a, b) => new Date(b.publishedAt || b.reportGeneratedAt || 0) - new Date(a.publishedAt || a.reportGeneratedAt || 0));
}

function collectCandidateNews(reports) {
  const latestReport = reports[0];
  if (!latestReport) return [];
  return (latestReport.candidates || [])
    .filter(isAdminVisibleCandidate)
    .map((item) => ({
      ...item,
      reportName: latestReport.name,
      reportGeneratedAt: latestReport.generatedAt,
      dryRun: latestReport.dryRun
    }))
    .sort((a, b) => new Date(b.publishedAt || b.reportGeneratedAt || 0) - new Date(a.publishedAt || a.reportGeneratedAt || 0));
}

function collectNeedsReviewNews(reports) {
  const latestReport = reports[0];
  if (!latestReport) return [];
  return (latestReport.needsReviewArticles || [])
    .map((item) => ({
      ...(item.article || {}),
      reasons: item.reasons || [],
      decision: item.decision || {},
      reportName: latestReport.name,
      reportGeneratedAt: latestReport.generatedAt,
      dryRun: latestReport.dryRun,
      status: "Needs review"
    }))
    .filter(isAdminVisibleCandidate)
    .sort((a, b) => new Date(b.publishedAt || b.reportGeneratedAt || 0) - new Date(a.publishedAt || a.reportGeneratedAt || 0));
}

function isAdminVisibleCandidate(item) {
  const text = [item.title, item.description, item.summary, item.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const blocked = [
    "gold rate",
    "silver rate",
    "petrol price",
    "diesel price",
    "weather",
    "thunderstorm",
    "rain alert",
    "admission",
    "exam",
    "murder",
    "suicide",
    "rape",
    "crime",
    "election",
    "politics"
  ];
  return !blocked.some((term) => text.includes(term));
}

async function updateCity(code, enabled) {
  const settings = await ensureSettings();
  const normalizedCode = String(code || "").trim().toLowerCase();
  if (!workbookCityRules.some((city) => city.code === normalizedCode)) {
    throw new Error(`Unknown city code: ${normalizedCode}`);
  }

  if (settings.allCitiesEnabled) {
    const disabledSet = new Set(settings.disabledCityCodes);
    if (enabled) disabledSet.delete(normalizedCode);
    else disabledSet.add(normalizedCode);
    settings.disabledCityCodes = [...disabledSet].sort();
  } else {
    const enabledSet = new Set(settings.enabledCityCodes);
    if (enabled) enabledSet.add(normalizedCode);
    else enabledSet.delete(normalizedCode);
    settings.enabledCityCodes = [...enabledSet].sort();
  }

  await saveSettings(settings);
  return settings;
}

async function updateSettingsPatch(patch) {
  const settings = await ensureSettings();
  const next = normalizeSettings({ ...settings, ...patch });

  if (patch.allCitiesEnabled === true) {
    next.allCitiesEnabled = true;
    next.enabledCityCodes = workbookCityRules.map((city) => city.code).sort();
  }

  if (patch.allCitiesEnabled === false) {
    next.allCitiesEnabled = false;
  }

  await saveSettings(next);
  return next;
}

async function addManualSource(payload) {
  const settings = await ensureSettings();
  const source = normalizeManualSource(payload, settings.manualSources.length);
  if (!source.url || !/^https?:\/\//i.test(source.url)) {
    throw new Error("Source URL must start with http:// or https://");
  }
  const existingIndex = settings.manualSources.findIndex((item) => item.id === source.id || item.url === source.url);
  if (existingIndex >= 0) settings.manualSources[existingIndex] = source;
  else settings.manualSources.push(source);
  await saveSettings(settings);
  return source;
}

async function removeManualSource(id) {
  const settings = await ensureSettings();
  settings.manualSources = settings.manualSources.filter((source) => source.id !== id);
  await saveSettings(settings);
  return settings;
}

async function updateSource(id, patch) {
  const settings = await ensureSettings();
  const index = settings.manualSources.findIndex((source) => source.id === id);

  if (index >= 0) {
    settings.manualSources[index] = normalizeManualSource({
      ...settings.manualSources[index],
      ...patch,
      id
    }, index);
    await saveSettings(settings);
    return settings.manualSources[index];
  }

  const normalizedId = String(id || "").trim().toLowerCase();
  const normalizedUrl = normalizeSourceUrl(patch.url);
  const disabledIds = new Set(settings.disabledSourceIds);
  const disabledUrls = new Set(settings.disabledSourceUrls);

  if (patch.enabled === false) {
    if (normalizedId) disabledIds.add(normalizedId);
    if (normalizedUrl) disabledUrls.add(normalizedUrl);
  } else {
    disabledIds.delete(normalizedId);
    if (normalizedUrl) disabledUrls.delete(normalizedUrl);
  }

  settings.disabledSourceIds = [...disabledIds].sort();
  settings.disabledSourceUrls = [...disabledUrls].sort();
  await saveSettings(settings);
  return settings;
}

async function startDryRun(payload = {}) {
  if (activeDryRun && !activeDryRun.done) throw new Error("A dry run is already running.");
  const settings = await ensureSettings();
  const enabledCityCodes = normalizeCodeList(payload.enabledCityCodes, settings.enabledCityCodes);
  const backfillFrom = String(payload.backfillFrom || "").trim();
  const backfillTo = String(payload.backfillTo || "").trim();
  const targetCityCodes = normalizeCodeList(payload.targetCityCodes, []);
  const resendBackfill = payload.resendBackfill === true;

  settings.lastBackfill = {
    cityCodes: targetCityCodes,
    from: backfillFrom,
    to: backfillTo,
    resendBackfill,
    maxItemsPerSource: Number(payload.maxItemsPerSource || 12),
    maxItemsPerRun: Number(payload.maxItemsPerRun || 80)
  };
  await saveSettings(settings);

  activeDryRunLog = [];
  activeDryRun = {
    startedAt: new Date().toISOString(),
    done: false,
    exitCode: null,
    command: "npm start",
    env: {
      DRY_RUN: "true",
      ENABLED_CITY_CODES: enabledCityCodes.join(","),
      DISABLED_CITY_CODES: settings.disabledCityCodes.join(","),
      DISABLED_SOURCE_IDS: settings.disabledSourceIds.join(","),
      DISABLED_SOURCE_URLS: settings.disabledSourceUrls.join("\n"),
      ALLOW_NOIDA_API: "false",
      MAX_ITEMS_PER_SOURCE: String(Number(payload.maxItemsPerSource || 12)),
      MAX_ITEMS_PER_RUN: String(Number(payload.maxItemsPerRun || 80)),
      MAX_PAGES_PER_SOURCE: String(Number(payload.maxPagesPerSource || 1)),
      DEFAULT_LOOKBACK_DAYS: String(Number(payload.lookbackDays || 20)),
      BACKFILL_FROM: backfillFrom,
      BACKFILL_TO: backfillTo,
      TARGET_CITY_CODES: targetCityCodes.join(","),
      RESEND_BACKFILL: resendBackfill ? "true" : "false",
      APP_API_URL: "",
      APP_API_KEY: ""
    }
  };

  const child = spawn("npm", ["start"], {
    cwd: rootDir,
    shell: true,
    env: { ...process.env, ...activeDryRun.env }
  });
  activeDryRun.process = child;
  child.stdout.on("data", appendDryRunLog);
  child.stderr.on("data", appendDryRunLog);
  child.on("close", (code) => {
    activeDryRun.done = true;
    activeDryRun.exitCode = code;
    activeDryRun.finishedAt = new Date().toISOString();
    activeDryRun.process = null;
  });

  return getDryRunState();
}

function appendDryRunLog(chunk) {
  const text = chunk.toString("utf8");
  activeDryRunLog.push(...text.split(/\r?\n/).filter(Boolean));
  if (activeDryRunLog.length > 400) activeDryRunLog = activeDryRunLog.slice(-400);
}

function getDryRunState() {
  if (!activeDryRun) return { running: false, log: [] };
  return {
    running: !activeDryRun.done,
    startedAt: activeDryRun.startedAt,
    finishedAt: activeDryRun.finishedAt,
    exitCode: activeDryRun.exitCode,
    command: activeDryRun.command,
    env: activeDryRun.env,
    log: activeDryRunLog.slice(-200)
  };
}

function stableId(value) {
  let hash = 0;
  for (const char of String(value)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `id-${Math.abs(hash)}`;
}

async function routeApi(request, response, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/state") {
      sendJson(response, 200, await getDashboardState());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/settings") {
      await updateSettingsPatch(await readJsonBody(request));
      sendJson(response, 200, await getDashboardState());
      return;
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/cities/")) {
      const code = decodeURIComponent(url.pathname.split("/").pop());
      const body = await readJsonBody(request);
      await updateCity(code, Boolean(body.enabled));
      sendJson(response, 200, await getDashboardState());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/sources") {
      await addManualSource(await readJsonBody(request));
      sendJson(response, 200, await getDashboardState());
      return;
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/sources/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      await updateSource(id, await readJsonBody(request));
      sendJson(response, 200, await getDashboardState());
      return;
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/sources/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      await removeManualSource(id);
      sendJson(response, 200, await getDashboardState());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/dry-run") {
      sendJson(response, 202, await startDryRun(await readJsonBody(request)));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/dry-run") {
      sendJson(response, 200, getDryRunState());
      return;
    }
    sendJson(response, 404, { error: "Unknown API route" });
  } catch (error) {
    sendJson(response, 400, { error: error.message || String(error) });
  }
}

export { getDashboardState };

function startAdminServer() {
  const server = http.createServer(async (request, response) => {
    if (!requireAdminAuth(request, response)) return;
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url);
      return;
    }
    await serveStatic(response, url.pathname);
  });

  server.listen(port, () => {
    console.log(`News admin running at http://localhost:${port}`);
    if (adminAuth.enabled) {
      console.log(`Admin login enabled. Username: ${adminAuth.username}`);
      if (adminAuth.usingDefaultPassword) console.log("Using default admin password. Set ADMIN_PASSWORD in .env before serious use.");
    } else {
      console.log("Admin login disabled by ADMIN_AUTH=false.");
    }
    console.log("Dry runs launched from this admin force DRY_RUN=true and clear APP_API_URL/APP_API_KEY.");
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startAdminServer();
}
