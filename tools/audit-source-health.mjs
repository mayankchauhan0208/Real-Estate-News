import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSourceUrls, isAllowedSource, isLikelyFeedUrl, getFeedFallbackPageUrl } from "../src/index.js";
import { citySourceRules } from "../src/city-config.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const settingsPath = path.join(rootDir, "config", "admin-settings.json");
const outputDir = path.join(rootDir, "reports", "source-audits");
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36 BrokketNewsSourceAudit/1.0";
const timeoutMs = Number(process.env.SOURCE_AUDIT_TIMEOUT_MS || 12000);
const concurrency = Math.max(1, Math.min(Number(process.env.SOURCE_AUDIT_CONCURRENCY || 28), 40));

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
    let sample = "";
    try {
      sample = (await response.text()).slice(0, 500).replace(/\s+/g, " ").trim();
    } catch {
      sample = "";
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      contentType,
      elapsedMs: Date.now() - startedAt,
      sample
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
    return { ...row, health: row.allowedByRuntime ? "disabled" : "blocked", checkedUrl: "", httpStatus: "", finalUrl: "", elapsedMs: "", error: row.allowedByRuntime ? "disabled in admin" : "blocked by runtime source policy", fallbackUsed: false };
  }
  const result = await probeSource(row.url);
  const health = result.ok ? "working" : "failed";
  if ((index + 1) % 25 === 0 || !result.ok) {
    console.log(`${index + 1}/${rows.length} ${health}: ${row.url}${result.fallbackUsed ? ` -> ${result.checkedUrl}` : ""}${result.error ? ` (${result.error})` : result.status ? ` (${result.status})` : ""}`);
  }
  return {
    ...row,
    health,
    checkedUrl: result.checkedUrl,
    httpStatus: result.status,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    elapsedMs: result.elapsedMs,
    error: result.error || (result.ok ? "" : result.statusText || "not ok"),
    fallbackUsed: result.fallbackUsed,
    originalStatus: result.originalStatus || "",
    originalError: result.originalError || ""
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  total: audited.length,
  working: audited.filter((row) => row.health === "working").length,
  failed: audited.filter((row) => row.health === "failed").length,
  blocked: audited.filter((row) => row.health === "blocked").length,
  disabled: audited.filter((row) => row.health === "disabled").length,
  selectedInRuntime: audited.filter((row) => row.selectedInRuntime).length,
  fallbackUsed: audited.filter((row) => row.fallbackUsed).length,
  duplicateRows: audited.filter((row) => row.duplicateCount > 1).length
};

await fs.mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonPath = path.join(outputDir, `source-audit-${stamp}.json`);
await fs.writeFile(jsonPath, JSON.stringify({ summary, rows: audited }, null, 2));
console.log(`Source audit JSON written: ${jsonPath}`);
console.log(JSON.stringify(summary, null, 2));






