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

if (duplicateCodes.length || aliasCollisions.length || unknownSourceCities.length) {
  console.error(JSON.stringify({ duplicateCodes, aliasCollisions, unknownSourceCities }, null, 2));
  process.exit(1);
}

console.log(`City configuration audit passed: ${cityCodes.length} unique cities, ${citySourceRules.length} source rules.`);
