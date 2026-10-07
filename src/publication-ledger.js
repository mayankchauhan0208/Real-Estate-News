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

const BUILDER_ALIASES = [
  [/\bgaur(?:s|sons)?\b/i, "gaurs"],
  [/\bcounty(?:\s+group)?\b/i, "county-group"],
  [/\bdlf\b/i, "dlf"],
  [/\bprestige(?: estates| group)?\b/i, "prestige"],
  [/\bgodrej properties\b/i, "godrej-properties"],
  [/\bsignature\s*global\b/i, "signatureglobal"],
  [/\bm3m\b/i, "m3m"],
  [/\belan group\b/i, "elan"]
];

function semanticText(article = {}) {
  return [article.title, article.description, article.articleText, article.articleTextExcerpt]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC");
}

function semanticNumbers(text) {
  return [...new Set([...text.matchAll(/(?:₹|rs\.?\s*)?([\d]+(?:[,.][\d]+)*)\s*(?:-|\s+)?(crore|cr|lakh|acre|acres|apartments?|flats?|units?|homes?|million\s+sq\.?\s*ft)?/gi)]
    .map((match) => `${match[1].replace(/,/g, "")}:${(match[2] || "number").toLowerCase().replace(/\s+/g, " ").replace(/^cr$/, "crore").replace(/^acres?$/, "acre")}`)
    .filter((value) => !value.startsWith("0:")))].sort();
}

function semanticEventType(text) {
  if (/\b(?:sell(?:s|ing)?|sold|sell[- ]out|sales|bookings?)\b/i.test(text)) return "residential-sale";
  if (/\b(?:launch(?:es|ed|ing)?|unveil(?:s|ed|ing)?|upcoming)\b/i.test(text) ||
      /\b(?:plans?|develop(?:s|ed|ing)?|build(?:s|ing)?)\b[^.!?]{0,100}\b(?:develop|build|project|development|home|housing|apartment|acre)\b/i.test(text)) return "project-launch";
  if (/\b(?:acquire(?:s|d)?|acquisition|land parcel|land purchase)\b/i.test(text)) return "land-acquisition";
  if (/\b(?:approve(?:s|d)?|sanction(?:s|ed)?|permission)\b/i.test(text)) return "development-approval";
  return "";
}

function semanticProject(text) {
  const known = [
    [/\bgaur\s+alaris\b/i, "gaur-alaris"],
    [/\bprestige\s+parklane\b/i, "prestige-parklane"],
    [/\bdlf\s+aureva\b/i, "dlf-aureva"]
  ];
  return known.find(([pattern]) => pattern.test(text))?.[1] || "";
}

function canonicalEventCityFor(article = {}, text = semanticText(article)) {
  const explicit = String(article.canonicalEventCity || article.eventCity || "").trim().toLowerCase();
  if (explicit) return explicit;
  const title = String(article.title || "");
  const titleCities = [
    [ /\b(?:gurugram|gurgaon)\b/i, "gurugram" ],
    [ /\bgreater\s+noida\b/i, "noida" ],
    [ /\bnoida\b/i, "noida" ],
    [ /\bfaridabad\b/i, "faridabad" ],
    [ /\bghaziabad\b/i, "ghaziabad" ],
    [ /\blucknow\b/i, "lucknow" ],
    [ /\bvisakhapatnam\b/i, "visakhapatnam" ],
    [ /\bguwahati\b/i, "guwahati" ],
    [ /\bgoa\b/i, "goa" ],
    [ /\bbengaluru|bangalore\b/i, "bangalore" ]
  ].filter(([pattern]) => pattern.test(title)).map(([, city]) => city);
  if (titleCities.length === 1) return titleCities[0];
  return String(article.cityCode || article.city || "").trim().toLowerCase();
}

function canonicalEventFingerprintFor({ builder, city, project, eventType, text }) {
  if (builder === "signatureglobal" && city === "gurugram" &&
      /\b(?:194(?:\.22)?\s*[- ]?acre|194(?:\.22)?\s*acres?)\b/i.test(text)) {
    return "signatureglobal|gurugram|194-acre-development";
  }
  if (builder === "county-group" && city === "gurugram" &&
      /\b(?:844|24)\b/.test(text) && /\b(?:luxury|residential|housing)\b/i.test(text)) {
    return "county-group|gurugram|sector-88a|844-home-development";
  }
  if (!builder || !city || !eventType || (!project && !text)) return "";
  const anchors = semanticNumbers(text).slice(0, 3).join(",");
  return [builder, city, project || eventType, anchors].filter(Boolean).join("|");
}

function semanticClusterIdFor(fingerprint = "") {
  return fingerprint ? `cluster:${hash(fingerprint).slice(0, 24)}` : "";
}

function semanticIdentityFor(article = {}) {
  const text = semanticText(article);
  const city = canonicalEventCityFor(article, text);
  const builder = BUILDER_ALIASES.find(([pattern]) => pattern.test(text))?.[1] || "";
  const project = semanticProject(text);
  const eventType = semanticEventType(text);
  const numericAnchors = semanticNumbers(text);
  if (!city || !eventType || (!project && !builder) || numericAnchors.length === 0) return null;
  const canonicalEventFingerprint = canonicalEventFingerprintFor({ builder, city, project, eventType, text });
  return {
    city,
    canonicalEventCity: city,
    normalizedBuilder: builder,
    normalizedProject: project,
    canonicalEventType: eventType,
    builder,
    project,
    eventType,
    numericAnchors,
    canonicalEventFingerprint,
    semanticClusterId: semanticClusterIdFor(canonicalEventFingerprint)
  };
}

function semanticIdentityMatches(left, right) {
  const a = left?.semanticIdentity;
  const b = right?.semanticIdentity;
  if (!a || !b || (a.canonicalEventCity || a.city) !== (b.canonicalEventCity || b.city)) return false;
  if (a.builder && b.builder && a.builder !== b.builder) return false;
  if (a.project !== b.project && (a.project || b.project)) return false;
  if (a.canonicalEventFingerprint && b.canonicalEventFingerprint &&
      a.canonicalEventFingerprint === b.canonicalEventFingerprint) return true;
  const sharedNumericAnchors = a.numericAnchors.filter((value) => b.numericAnchors.includes(value));
  if (sharedNumericAnchors.length === 0) return false;
  if (a.eventType !== b.eventType) {
    // A single builder can report one development as land acquisition in one
    // article and as the planned project in another. Reconcile only that
    // narrow pair when the same city, builder, and at least two independent
    // numeric facts agree. This preserves distinct lifecycle events that share
    // only one amount or acreage figure.
    const sameDevelopment = new Set([a.eventType, b.eventType]);
    if (!sameDevelopment.has("land-acquisition") || !sameDevelopment.has("project-launch") || sharedNumericAnchors.length < 2) {
      return false;
    }
  }
  return Boolean(a.project || b.project || (a.builder && b.builder));
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
    publishedCity: city,
    canonicalEventCity: article.canonicalEventCity || article.eventCity || city,
    publicationDate: article.publishedAt || article.publicationDate || "",
    eventFingerprint: eventFingerprints[0] || "",
    semanticIdentity: article.semanticIdentity || semanticIdentityFor(article),
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
    const existing = ledger.entries.find((candidate) =>
      candidate.identityKeys.some((key) => entry.identityKeys.includes(key))
    );
    if (existing) {
      const enriched = entry.semanticIdentity && !existing.semanticIdentity;
      if (enriched) {
        existing.semanticIdentity = entry.semanticIdentity;
        changed = true;
      }
      continue;
    }
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
  const identity = identityFor(article, dedupeIds);
  const keys = new Set(identity.identityKeys);
  return ledger.entries.some((entry) =>
    entry.identityKeys.some((key) => keys.has(key)) || semanticIdentityMatches(entry, identity)
  );
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

export { canonicalEventCityFor, identityFor, normalizeTitle, normalizeUrl, validateLedger, semanticIdentityMatches };
