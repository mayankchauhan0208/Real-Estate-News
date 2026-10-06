import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const LEDGER_VERSION = 1;
const DEFAULT_LOCK_WAIT_MS = 15_000;
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CLAIM_TTL_MS = 15 * 60 * 1000;

function normalizeUrl(value = "") {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ocid$|ved$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "");
    return url.toString().toLowerCase();
  } catch {
    return String(value).trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function normalizeTitle(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function identityFor(article = {}, dedupeIds = []) {
  const canonicalUrl = article.canonicalUrl || article.newsLink || article.url || "";
  const normalizedUrl = normalizeUrl(canonicalUrl);
  const city = String(article.cityCode || article.city || "").trim().toLowerCase();
  const title = normalizeTitle(article.title || "");
  const ids = [...new Set((dedupeIds || []).filter(Boolean).map(String))];
  const eventFingerprints = ids.filter((id) => id.startsWith("event:"));
  const identityKeys = [
    normalizedUrl && `url:${normalizedUrl}`,
    title && city && `title-city:${title}|${city}`,
    ...ids.map((id) => `dedupe:${id}`),
    ...eventFingerprints.map((id) => `event:${id}`)
  ].filter(Boolean);

  if (!identityKeys.length) throw new Error("PUBLICATION_LEDGER_IDENTITY_MISSING");
  return {
    recordId: article.recordId || article.id || "",
    canonicalUrl,
    normalizedUrl,
    stableId: article.stableId || article.stable_id || "",
    unicodeNormalizedTitle: title,
    city: city ? [city] : [],
    publicationDate: article.publishedAt || article.publicationDate || "",
    eventFingerprint: eventFingerprints[0] || "",
    identityKeys: [...new Set(identityKeys)],
    postedAt: article.postedAt || new Date().toISOString(),
    originMode: article.originMode || article.mode || "NORMAL"
  };
}

function emptyLedger() {
  return { version: LEDGER_VERSION, updatedAt: new Date(0).toISOString(), entries: [] };
}

function validateLedger(value) {
  if (!value || value.version !== LEDGER_VERSION || !Array.isArray(value.entries)) {
    throw new Error("PUBLICATION_LEDGER_CORRUPT");
  }
  for (const entry of value.entries) {
    if (!entry || !Array.isArray(entry.identityKeys) || entry.identityKeys.length === 0) {
      throw new Error("PUBLICATION_LEDGER_CORRUPT_ENTRY");
    }
  }
  return value;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

async function acquireLock(lockPath, owner, waitMs = DEFAULT_LOCK_WAIT_MS, ttlMs = DEFAULT_LOCK_TTL_MS) {
  const started = Date.now();
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  while (Date.now() - started <= waitMs) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({ owner, expiresAt: Date.now() + ttlMs }) + "\n");
      await handle.close();
      return async () => { await fs.rm(lockPath, { force: true }); };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const current = await readJson(lockPath, null);
      if (current?.expiresAt && current.expiresAt <= Date.now()) {
        await fs.rm(lockPath, { force: true });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error("PUBLICATION_LEDGER_LOCK_TIMEOUT");
}

function mergeEntries(ledger, entries) {
  const known = new Set(ledger.entries.flatMap((entry) => entry.identityKeys));
  let changed = false;
  for (const entry of entries) {
    const keys = entry.identityKeys.filter((key) => !known.has(key));
    if (!keys.length) continue;
    const merged = { ...entry, identityKeys: [...new Set(entry.identityKeys)] };
    ledger.entries.push(merged);
    for (const key of merged.identityKeys) known.add(key);
    changed = true;
  }
  if (changed) ledger.updatedAt = new Date().toISOString();
  return changed;
}

export async function loadPublicationLedger({ ledgerPath, seedPath = "", persistSeed = true } = {}) {
  if (!ledgerPath) throw new Error("PUBLICATION_LEDGER_PATH_REQUIRED");
  let ledger = await readJson(ledgerPath, null);
  if (ledger === null) ledger = emptyLedger();
  validateLedger(ledger);
  const seed = seedPath ? await readJson(seedPath, emptyLedger()) : emptyLedger();
  validateLedger(seed);
  if (mergeEntries(ledger, seed.entries) && persistSeed) await writeJsonAtomic(ledgerPath, ledger);
  return ledger;
}

export function ledgerHasMatch(ledger, article, dedupeIds = []) {
  const keys = new Set(identityFor(article, dedupeIds).identityKeys);
  return ledger.entries.some((entry) => entry.identityKeys.some((key) => keys.has(key)));
}

export async function ensurePublicationLedgerWritable(ledgerPath) {
  const directory = path.dirname(ledgerPath);
  await fs.mkdir(directory, { recursive: true });
  const probe = `${ledgerPath}.${process.pid}.writable.tmp`;
  await fs.writeFile(probe, "ledger-writable\n", "utf8");
  await fs.rm(probe, { force: true });
}

export async function publishWithPublicationLedger({
  ledgerPath,
  seedPath,
  article,
  dedupeIds,
  mode = "NORMAL",
  publish,
  lockWaitMs = DEFAULT_LOCK_WAIT_MS,
  claimStore = null
}) {
  if (typeof publish !== "function") throw new Error("PUBLICATION_LEDGER_PUBLISH_CALLBACK_REQUIRED");
  await ensurePublicationLedgerWritable(ledgerPath);
  const release = await acquireLock(`${ledgerPath}.lock`, `${process.pid}-${Date.now()}`, lockWaitMs);
  try {
    const ledger = await loadPublicationLedger({ ledgerPath, seedPath });
    if (ledgerHasMatch(ledger, article, dedupeIds)) {
      return { duplicate: true, ledgerEntries: ledger.entries.length };
    }
    const claim = claimStore
      ? await claimStore.claim({ article, dedupeIds, mode })
      : null;
    if (claimStore && !claim?.acquired) {
      return { duplicate: true, claimLost: true, ledgerEntries: ledger.entries.length };
    }
    let result;
    try {
      result = await publish();
    } catch (error) {
      if (claimStore && claim) await claimStore.finalize(claim, "FAILED");
      throw error;
    }
    const status = Number(result?.status || 0);
    if (status < 200 || status >= 300) {
      if (claimStore && claim) await claimStore.finalize(claim, "FAILED");
      throw new Error(`PUBLICATION_POST_NOT_SUCCESSFUL_HTTP_${status || "UNKNOWN"}`);
    }
    const entry = identityFor({ ...article, originMode: mode }, dedupeIds);
    if (!mergeEntries(ledger, [entry])) throw new Error("PUBLICATION_LEDGER_IDENTITY_CONFLICT");
    await writeJsonAtomic(ledgerPath, ledger);
    if (claimStore && claim) await claimStore.finalize(claim, "PUBLISHED");
    return { duplicate: false, result, entry, ledgerEntries: ledger.entries.length };
  } finally {
    await release();
  }
}

export { identityFor, normalizeTitle, normalizeUrl, validateLedger };
