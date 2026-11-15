import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSourceUrls } from "../src/index.js";
import { citySourceRules, workbookCityRules } from "../src/city-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizeUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  }
}

function languageFor(category = "") {
  const match = String(category).toLowerCase().match(/regional-(hindi|marathi|gujarati|kannada|telugu|tamil|malayalam|bengali)/);
  return match ? match[1].toUpperCase() : "ENGLISH_OR_UNVERIFIED";
}

function isFeed(url = "") {
  try {
    const parsed = new URL(url);
    return /\.(xml|rss|atom)$/i.test(parsed.pathname)
      || /(^|\/)(rss|rssfeeds|feed|feeds|atom)(\/|$)/i.test(parsed.pathname)
      || /[?&](output|format)=(rss|xml|atom)\b/i.test(parsed.search);
  } catch {
    return false;
  }
}

function sourceType(source) {
  const value = `${source.label || ""} ${source.url || ""} ${source.category || ""}`.toLowerCase();
  if (/rera|urban development authority|development authority|housing board|cidco|dda\b|hs?vp|crda|municipal/.test(value)) return "OFFICIAL_AUTHORITY";
  if (/press.release|press-release|announcement|notice|circular|publication|whats-new|what's new/.test(value)) return "OFFICIAL_OR_CORPORATE_RELEASE";
  if (/realty|properties|developers?|builder|group\b|projects?/.test(value) && !/news|times|jagran|patrika|oneindia|lokmat|bhaskar|express/.test(value)) return "BUILDER_OR_DEVELOPER";
  if (String(source.category || "").toLowerCase().startsWith("regional-")) return "REGIONAL_NEWS";
  return isFeed(source.url) ? "RSS_OR_ATOM_NEWS" : "GENERAL_NEWS_OR_RESEARCH";
}

function extractionPath(source) {
  const type = sourceType(source);
  if (isFeed(source.url)) return "RSS_OR_ATOM -> ARTICLE_DETAIL";
  if (type === "OFFICIAL_AUTHORITY" || type === "OFFICIAL_OR_CORPORATE_RELEASE") return "HTML_LISTING -> DETAIL_OR_DOCUMENT -> PDF/OCR_IF_NEEDED";
  return "HTML_LISTING -> ARTICLE_DETAIL";
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function getNormalRuntimeUrls() {
  const names = ["SOURCE_URLS", "SOURCE_CATEGORY", "ENABLE_EXPERIMENTAL_SOURCES"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    // Mirror the committed normal workflow rather than the caller's shell.
    process.env.SOURCE_URLS = "";
    process.env.SOURCE_CATEGORY = "";
    process.env.ENABLE_EXPERIMENTAL_SOURCES = "true";
    return getSourceUrls();
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}

export function buildSourceCapabilityRegistry({ settings, runtimeUrls = getNormalRuntimeUrls(), cityRules = citySourceRules }) {
  const cities = new Map(workbookCityRules.map((city) => [city.code, city]));
  const records = new Map();
  const upsert = (url, patch) => {
    const key = normalizeUrl(url);
    if (!key) return;
    const existing = records.get(key) || {
      url,
      sourceIds: new Set(),
      labels: new Set(),
      categories: new Set(),
      cityCodes: new Set(),
      origins: new Set()
    };
    if (patch.id) existing.sourceIds.add(patch.id);
    if (patch.label) existing.labels.add(patch.label);
    if (patch.category) existing.categories.add(patch.category);
    for (const cityCode of patch.cityCodes || []) existing.cityCodes.add(cityCode);
    if (patch.origin) existing.origins.add(patch.origin);
    records.set(key, existing);
  };

  for (const source of settings.manualSources || []) {
    upsert(source.url, { ...source, origin: "MANUAL_SOURCE" });
  }
  for (const rule of cityRules) {
    for (const url of rule.urls || []) {
      upsert(url, { label: rule.code, cityCodes: [rule.code], origin: "CITY_SOURCE_RULE" });
    }
  }

  const active = new Set(runtimeUrls.map(normalizeUrl));
  for (const url of runtimeUrls) upsert(url, { origin: "RUNTIME" });

  const rows = [...records.values()].map((record) => {
    const categories = [...record.categories].sort();
    const cityCodes = [...record.cityCodes].sort();
    const category = categories[0] || "UNCLASSIFIED";
    const base = {
      url: record.url,
      label: [...record.labels].sort().join(" | "),
      sourceIds: [...record.sourceIds].sort(),
      categories,
      category,
      language: languageFor(category),
      sourceType: sourceType({ url: record.url, label: [...record.labels].join(" "), category }),
      extractionPath: extractionPath({ url: record.url, label: [...record.labels].join(" "), category }),
      activeInRuntime: active.has(normalizeUrl(record.url)),
      cityCodes,
      states: [...new Set(cityCodes.map((code) => cities.get(code)?.state).filter(Boolean))].sort(),
      origins: [...record.origins].sort(),
      healthEvidence: "CONFIGURATION_ONLY",
      latestReachability: "UNVERIFIED",
      latestDiscovery: "UNVERIFIED",
      latestFullArticle: "UNVERIFIED",
      latestQualifyingPositive: "UNVERIFIED",
      nextValidation: "Bounded listing/detail probe; retain only observed outcomes."
    };
    return base;
  }).sort((left, right) => left.url.localeCompare(right.url));

  const byLanguage = Object.fromEntries([...new Set(rows.map((row) => row.language))].sort().map((language) => {
    const members = rows.filter((row) => row.language === language);
    return [language, {
      configured: members.length,
      activeInRuntime: members.filter((row) => row.activeInRuntime).length,
      officialOrRelease: members.filter((row) => /OFFICIAL/.test(row.sourceType)).length,
      regionalNews: members.filter((row) => row.sourceType === "REGIONAL_NEWS").length
    }];
  }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evidenceBoundary: "This registry inventories configuration and runtime selection only. It does not claim network health, readability, freshness, or qualifying yield without a separate bounded source-health probe.",
    summary: {
      configuredUrls: rows.length,
      activeRuntimeUrls: rows.filter((row) => row.activeInRuntime).length,
      mappedCityCount: new Set(rows.flatMap((row) => row.cityCodes)).size,
      languages: byLanguage
    },
    rows
  };
}

export function writeSourceCapabilityRegistry(registry, outputDirectory = path.join(root, "reports", "source-capabilities")) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, "current-source-capability-registry.json");
  const csvPath = path.join(outputDirectory, "current-source-capability-registry.csv");
  fs.writeFileSync(jsonPath, `${JSON.stringify(registry, null, 2)}\n`);
  const columns = ["URL", "LABEL", "SOURCE_IDS", "CATEGORY", "LANGUAGE", "SOURCE_TYPE", "EXTRACTION_PATH", "ACTIVE_IN_RUNTIME", "CITY_CODES", "STATES", "ORIGINS", "HEALTH_EVIDENCE", "LATEST_REACHABILITY", "LATEST_DISCOVERY", "LATEST_FULL_ARTICLE", "LATEST_QUALIFYING_POSITIVE", "NEXT_VALIDATION"];
  const lines = [columns.join(",")];
  for (const row of registry.rows) {
    lines.push([
      row.url, row.label, row.sourceIds.join("|"), row.categories.join("|"), row.language, row.sourceType,
      row.extractionPath, row.activeInRuntime, row.cityCodes.join("|"), row.states.join("|"), row.origins.join("|"),
      row.healthEvidence, row.latestReachability, row.latestDiscovery, row.latestFullArticle,
      row.latestQualifyingPositive, row.nextValidation
    ].map(csvCell).join(","));
  }
  fs.writeFileSync(csvPath, `${lines.join("\n")}\n`);
  return { jsonPath, csvPath };
}
