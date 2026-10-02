import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { articleDedupeIds, normalizeArticleUrlForDedupe } from "../src/index.js";

const root = process.cwd();
const outputDir = path.join(root, "reports", "source-audits", "task37");
const backupDir = path.join(process.env.TEMP || process.env.TMP || root, "task37-production-cleanup-20261002");

function loadEnv() {
  const text = requireText(path.join(root, ".env"));
  return text.split(/\r?\n/).reduce((env, line) => {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
    return env;
  }, {});
}

function requireText(filePath) {
  return fsSync.readFileSync(filePath, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function recordValid(record) {
  return Boolean(
    record &&
    String(record.id || "").trim() &&
    String(record.title || "").trim() &&
    /^https?:\/\//i.test(String(record.newsLink || "")) &&
    String(record.cityCode || "").trim() &&
    String(record.postedBy || "").trim() &&
    record.isActive === true
  );
}

function dateValue(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

async function fetchAll(env) {
  const url = env.APP_LIST_API_URL || "https://www.brokket.app/api/more-pages/news/list";
  const token = env.APP_LIST_API_KEY || env.APP_API_KEY || "";
  const items = [];
  let page = 0;
  let totalPages = 1;
  for (; page < totalPages && page < 100; page += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}`, ACCESS_TOKEN: token } : {})
      },
      body: JSON.stringify({ page, size: 1000 })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`Live list request failed: HTTP ${response.status}`);
    const pageData = body?.data?.page || body?.data || body;
    if (!Array.isArray(pageData?.content)) throw new Error("Live list response has no page content.");
    items.push(...pageData.content);
    totalPages = Number(pageData.totalPages || 1);
    if (pageData.content.length === 0) break;
  }
  return { url, items, pages: page };
}

const env = loadEnv();
const { url, items, pages } = await fetchAll(env);
const groups = new Map();
for (const record of items) {
  const normalizedUrl = normalizeArticleUrlForDedupe(record.newsLink || "");
  const city = String(record.cityCode || "").trim().toLowerCase();
  if (!normalizedUrl || !city) continue;
  const key = `${normalizedUrl}|${city}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(record);
}

const deterministicGroups = [];
for (const [key, records] of groups) {
  if (records.length < 2) continue;
  const valid = records.filter(recordValid);
  const candidates = (valid.length ? valid : records).slice().sort((a, b) => dateValue(a.createdAt) - dateValue(b.createdAt));
  const keep = candidates[0];
  const remove = records.filter((record) => record.id !== keep.id);
  const normalizedUrl = normalizeArticleUrlForDedupe(keep.newsLink || "");
  deterministicGroups.push({
    groupId: sha256(key).slice(0, 16),
    duplicateType: records.every((record) => String(record.newsLink || "").trim().toLowerCase() === String(keep.newsLink || "").trim().toLowerCase()) ? "EXACT_URL_SAME_CITY" : "NORMALIZED_URL_SAME_CITY",
    recordIds: records.map((record) => record.id),
    titles: records.map((record) => record.title || ""),
    source: records.map((record) => record.postedBy || ""),
    canonicalUrl: normalizedUrl,
    normalizedUrl,
    city: String(keep.cityCode || "").trim().toLowerCase(),
    createdTimestamps: records.map((record) => record.createdAt || ""),
    articleTimestamps: records.map(() => "not-exposed-by-live-list-api"),
    keepRecordId: keep.id,
    removeRecordIds: remove.map((record) => record.id),
    keepReason: recordValid(keep) ? "oldest valid active record" : "oldest available record; no valid active record existed"
  });
}

const urlGroups = new Map();
for (const record of items) {
  const normalizedUrl = normalizeArticleUrlForDedupe(record.newsLink || "");
  if (!normalizedUrl) continue;
  if (!urlGroups.has(normalizedUrl)) urlGroups.set(normalizedUrl, []);
  urlGroups.get(normalizedUrl).push(record);
}
const crossCityProtected = [...urlGroups.values()].filter((records) => new Set(records.map((record) => record.cityCode)).size > 1 && new Set(records.map((record) => `${record.newsLink}|${record.cityCode}`)).size === records.length).length;
const manifest = {
  generatedAt: new Date().toISOString(),
  readOnlySource: url,
  pages,
  liveRecordsBefore: items.length,
  duplicateGroups: deterministicGroups.length,
  deterministicGroups,
  ambiguousGroups: [],
  recordsProposedRemoval: deterministicGroups.reduce((sum, group) => sum + group.removeRecordIds.length, 0),
  recordsRetained: deterministicGroups.length,
  crossCityProtectedGroups: crossCityProtected,
  deletionExecuted: false,
  deletionEndpoint: "not documented; no mutation attempted"
};
const manifestText = JSON.stringify(manifest, null, 2);
const removalRecords = new Map();
for (const group of deterministicGroups) for (const id of group.removeRecordIds) {
  const record = items.find((item) => item.id === id);
  if (record) removalRecords.set(id, record);
}
const backupText = JSON.stringify({ generatedAt: manifest.generatedAt, records: [...removalRecords.values()] }, null, 2);
const backupPath = path.join(backupDir, "duplicate-records-backup.json");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(backupDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "duplicate-cleanup-manifest.json"), manifestText);
await fs.writeFile(path.join(outputDir, "duplicate-cleanup-backup.json"), backupText);
await fs.writeFile(backupPath, backupText);
const backupRead = await fs.readFile(backupPath, "utf8");
const result = {
  ...manifest,
  backupLocation: backupPath,
  backupRecords: removalRecords.size,
  backupChecksum: sha256(backupRead),
  backupReadable: true,
  backupCountMatchesRemovalCount: removalRecords.size === manifest.recordsProposedRemoval
};
await fs.writeFile(path.join(outputDir, "task37-cleanup-audit-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
