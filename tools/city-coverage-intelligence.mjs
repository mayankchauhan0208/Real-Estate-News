import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workbookCityRules } from "../src/city-config.js";
import { buildSourceCapabilityRegistry } from "./source-capability-registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizeUrl(value = "") {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  }
}

function probeIndex(probeRows = []) {
  const byUrl = new Map();
  for (const row of probeRows) {
    const key = normalizeUrl(row.url);
    const prior = byUrl.get(key);
    if (!prior || String(row.generatedAt || "") > String(prior.generatedAt || "")) byUrl.set(key, row);
  }
  return byUrl;
}

export function buildCityCoverageIntelligence({ registry, cities = workbookCityRules, probeRows = [] }) {
  const probes = probeIndex(probeRows);
  const rows = cities.map((city) => {
    const sources = registry.rows.filter((source) => source.activeInRuntime && source.cityCodes.includes(city.code));
    const cityName = String(city.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const cityFocused = sources.filter((source) => {
      const scope = source.cityCodes.length;
      const sourceText = `${source.url} ${source.label}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
      return scope <= 3 || (cityName.length >= 4 && sourceText.includes(cityName));
    });
    const proven = sources.filter((source) => {
      const probe = probes.get(normalizeUrl(source.url));
      return probe?.status === "SUCCESS" && Number(probe.fullArticlesReadable || 0) > 0;
    });
    const languageSources = sources.filter((source) => source.language !== "ENGLISH_OR_UNVERIFIED");
    const officialSources = sources.filter((source) => /^OFFICIAL/.test(source.sourceType));
    const provenCityFocused = cityFocused.filter((source) => {
      const probe = probes.get(normalizeUrl(source.url));
      return probe?.status === "SUCCESS" && Number(probe.fullArticlesReadable || 0) > 0;
    });
    const status = sources.length === 0
      ? "NO_ACTIVE_ASSIGNED_SOURCE"
      : proven.length === 0
        ? "ACTIVE_BUT_NOT_RUNTIME_PROVEN"
        : proven.length === 1
          ? "SINGLE_RUNTIME_PROVEN_SOURCE"
          : "MULTI_RUNTIME_PROVEN_SOURCE";
    return {
      cityCode: city.code,
      city: city.name,
      state: city.state,
      activeAssignedSources: sources.length,
      officialSources: officialSources.length,
      nativeLanguageSources: languageSources.length,
      cityFocusedSources: cityFocused.length,
      runtimeProvenReadableSources: proven.length,
      runtimeProvenCityFocusedSources: provenCityFocused.length,
      status,
      sourceUrls: sources.map((source) => source.url),
      cityFocusedSourceUrls: cityFocused.map((source) => source.url),
      provenSourceUrls: proven.map((source) => source.url)
    };
  }).sort((left, right) => left.activeAssignedSources - right.activeAssignedSources || left.city.localeCompare(right.city));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evidenceBoundary: "Runtime proof is only credited for sources with a completed local canonical probe and at least one readable article. Absence of proof is not a claim that a source is broken.",
    summary: {
      cityCount: rows.length,
      noActiveAssignedSource: rows.filter((row) => row.status === "NO_ACTIVE_ASSIGNED_SOURCE").length,
      activeButNotRuntimeProven: rows.filter((row) => row.status === "ACTIVE_BUT_NOT_RUNTIME_PROVEN").length,
      noCityFocusedSource: rows.filter((row) => row.cityFocusedSources === 0).length,
      singleRuntimeProvenSource: rows.filter((row) => row.status === "SINGLE_RUNTIME_PROVEN_SOURCE").length,
      multiRuntimeProvenSource: rows.filter((row) => row.status === "MULTI_RUNTIME_PROVEN_SOURCE").length
    },
    rows
  };
}

export function readRuntimeProbeRows(directory = path.join(root, "reports", "source-capabilities", "runtime-probes")) {
  if (!fs.existsSync(directory)) return [];
  const rows = [];
  for (const name of fs.readdirSync(directory).filter((file) => file.endsWith(".json"))) {
    const report = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
    for (const row of report.rows || []) rows.push({ ...row, generatedAt: report.summary?.generatedAt || report.generatedAt || "" });
  }
  return rows;
}

export function writeCityCoverageIntelligence(report, outputDirectory = path.join(root, "reports", "city-coverage")) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, "current-city-coverage-intelligence.json");
  const csvPath = path.join(outputDirectory, "current-city-coverage-intelligence.csv");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const columns = ["CITY_CODE", "CITY", "STATE", "ACTIVE_ASSIGNED_SOURCES", "OFFICIAL_SOURCES", "NATIVE_LANGUAGE_SOURCES", "CITY_FOCUSED_SOURCES", "RUNTIME_PROVEN_READABLE_SOURCES", "RUNTIME_PROVEN_CITY_FOCUSED_SOURCES", "STATUS", "SOURCE_URLS", "CITY_FOCUSED_SOURCE_URLS", "PROVEN_SOURCE_URLS"];
  const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [columns.join(","), ...report.rows.map((row) => [row.cityCode, row.city, row.state, row.activeAssignedSources, row.officialSources, row.nativeLanguageSources, row.cityFocusedSources, row.runtimeProvenReadableSources, row.runtimeProvenCityFocusedSources, row.status, row.sourceUrls.join("|"), row.cityFocusedSourceUrls.join("|"), row.provenSourceUrls.join("|")].map(cell).join(","))];
  fs.writeFileSync(csvPath, `${lines.join("\n")}\n`);
  return { jsonPath, csvPath };
}
