import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "reports", "source-capabilities", "current-source-capability-registry.json");
const outDir = path.join(root, "reports", "source-capabilities");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const limit = Math.max(1, Math.min(Number(process.env.PRIORITY_SOURCE_PROBE_LIMIT || 8), 40));
const offset = Math.max(0, Number(process.env.PRIORITY_SOURCE_PROBE_OFFSET || 0));
const selectionCeiling = offset + limit;
const nativeLanguages = new Set(["HINDI", "MARATHI", "GUJARATI", "KANNADA", "TELUGU", "TAMIL", "MALAYALAM", "BENGALI"]);

const score = (row) => {
  let value = row.cityCodes.length * 10;
  if (/rera/i.test(`${row.label} ${row.url}`)) value += 1000;
  if (row.sourceType === "OFFICIAL_AUTHORITY") value += 300;
  if (row.sourceType === "OFFICIAL_OR_CORPORATE_RELEASE") value += 200;
  if (nativeLanguages.has(row.language)) value += 100;
  if (row.sourceType === "REGIONAL_NEWS") value += 50;
  return value;
};

const active = registry.rows.filter((row) => row.activeInRuntime);
const selected = [];
const seen = new Set();
const add = (row, reason) => {
  if (!row || seen.has(row.url) || selected.length >= selectionCeiling) return;
  seen.add(row.url);
  selected.push({ url: row.url, sourceId: row.sourceIds[0] || "", label: row.label, language: row.language, sourceType: row.sourceType, cityCodes: row.cityCodes, reason });
};

for (const language of [...nativeLanguages].sort()) {
  add(active.filter((row) => row.language === language).sort((a, b) => score(b) - score(a) || a.url.localeCompare(b.url))[0], "one-native-language-control");
}
for (const row of active.filter((row) => /rera/i.test(`${row.label} ${row.url}`)).sort((a, b) => score(b) - score(a) || a.url.localeCompare(b.url))) add(row, "rera-or-authority-priority");
for (const row of active.filter((row) => ["OFFICIAL_AUTHORITY", "OFFICIAL_OR_CORPORATE_RELEASE"].includes(row.sourceType)).sort((a, b) => score(b) - score(a) || a.url.localeCompare(b.url))) add(row, "official-coverage-priority");
for (const row of active.filter((row) => row.sourceType === "REGIONAL_NEWS").sort((a, b) => score(b) - score(a) || a.url.localeCompare(b.url))) add(row, "regional-coverage-priority");

fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, "priority-source-probe-input.json");
const urlsPath = path.join(outDir, "priority-source-probe-urls.txt");
const shard = selected.slice(offset, offset + limit);
fs.writeFileSync(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), offset, limit, selected: shard }, null, 2)}\n`);
fs.writeFileSync(urlsPath, `${shard.map((item) => item.url).join("\n")}\n`);
console.log(JSON.stringify({ offset, selected: shard.length, jsonPath, urlsPath, reasons: Object.fromEntries(Object.entries(Object.groupBy(shard, (item) => item.reason)).map(([reason, rows]) => [reason, rows.length])) }, null, 2));
