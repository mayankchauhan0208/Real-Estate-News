import fs from "node:fs/promises";
import { citySourceRules, workbookCityRules } from "./city-config.js";

const cityCodes = workbookCityRules.map((city) => city.code);
const duplicateCodes = [...new Set(cityCodes.filter((code, index) => cityCodes.indexOf(code) !== index))];
const aliasOwners = new Map();

for (const city of workbookCityRules) {
  for (const keyword of city.keywords || []) {
    const alias = String(keyword || "").trim().toLowerCase();
    if (!alias) continue;
    const owners = aliasOwners.get(alias) || [];
    owners.push(city.code);
    aliasOwners.set(alias, owners);
  }
}

const aliasCollisions = [...aliasOwners.entries()]
  .map(([alias, owners]) => ({ alias, owners: [...new Set(owners)] }))
  .filter((item) => item.owners.length > 1);
const knownCodes = new Set(cityCodes);
const unknownSourceCities = [...new Set(citySourceRules.map((source) => source.code).filter((code) => !knownCodes.has(code)))];
const adminSettings = JSON.parse(await fs.readFile(new URL("../config/admin-settings.json", import.meta.url), "utf8"));
const manualSources = Array.isArray(adminSettings.manualSources) ? adminSettings.manualSources : [];
const unknownManualSourceCities = [
  ...new Set(manualSources.flatMap((source) => source.cityCodes || []).filter((code) => !knownCodes.has(code)))
];
const normalizeUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  }
};
const manualUrlCounts = new Map();
for (const source of manualSources) {
  const url = normalizeUrl(source.url);
  if (url) manualUrlCounts.set(url, (manualUrlCounts.get(url) || 0) + 1);
}
const duplicateManualUrls = [...manualUrlCounts.entries()]
  .filter(([, count]) => count > 1)
  .map(([url]) => url);

if (duplicateCodes.length || aliasCollisions.length || unknownSourceCities.length || unknownManualSourceCities.length || duplicateManualUrls.length) {
  console.error(
    JSON.stringify(
      { duplicateCodes, aliasCollisions, unknownSourceCities, unknownManualSourceCities, duplicateManualUrls },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  `City/source configuration audit passed: ${cityCodes.length} unique cities, ${citySourceRules.length} source rules, ${manualSources.length} unique manual sources.`
);
