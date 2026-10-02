import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000;

const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

export function stableSourceId(source) {
  const url = normalizeUrl(typeof source === "string" ? source : source.url);
  if (!url) throw new Error("A source URL is required for stable identity");
  return `source-${crypto.createHash("sha256").update(url.toLowerCase()).digest("hex").slice(0, 16)}`;
}

export function buildCycleSnapshot(activeSources, cycleId, createdAt = new Date().toISOString()) {
  const byId = new Map();
  for (const item of activeSources || []) {
    const url = normalizeUrl(typeof item === "string" ? item : item.url);
    if (!url) continue;
    const source = typeof item === "string" ? { url } : { ...item, url };
    const sourceId = stableSourceId(source);
    if (!byId.has(sourceId)) byId.set(sourceId, { sourceId, url, ...source });
  }
  const sources = [...byId.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const universeFingerprint = crypto.createHash("sha256")
    .update(sources.map((source) => source.sourceId).join("\n"))
    .digest("hex");
  return {
    cycleId,
    createdAt,
    universeFingerprint,
    sources
  };
}

export function createSchedulerState() {
  return { version: 1, activeCycle: null, sources: {}, lock: null };
}

export function startOrResumeCycle(state, snapshot) {
  const next = state || createSchedulerState();
  if (!next.activeCycle || next.activeCycle.cycleId !== snapshot.cycleId) {
    next.activeCycle = {
      cycleId: snapshot.cycleId,
      createdAt: snapshot.createdAt,
      sourceIds: snapshot.sources.map((source) => source.sourceId),
      completedSourceIds: [],
      completedShardIds: [],
      nextShardNumber: 1,
      universeFingerprint: snapshot.universeFingerprint,
      cyclePositionStart: 0,
      lastCheckpointAt: null
    };
  } else {
    const previousCompleted = new Set(next.activeCycle.completedSourceIds || []);
    const newSourceIds = new Set(snapshot.sources.map((source) => source.sourceId));
    const migratedCompleted = [...previousCompleted].filter((sourceId) => newSourceIds.has(sourceId)).sort();
    const universeChanged = next.activeCycle.universeFingerprint !== snapshot.universeFingerprint ||
      (next.activeCycle.sourceIds || []).length !== snapshot.sources.length ||
      (next.activeCycle.sourceIds || []).some((sourceId, index) => sourceId !== snapshot.sources[index]?.sourceId);
    next.activeCycle.sourceIds = snapshot.sources.map((source) => source.sourceId);
    next.activeCycle.completedSourceIds = migratedCompleted;
    if (universeChanged) {
      next.activeCycle.completedShardIds = (next.activeCycle.completedShardIds || []).filter(Boolean);
      next.activeCycle.cyclePositionStart = migratedCompleted.length;
    }
  }
  next.activeCycle.universeFingerprint = snapshot.universeFingerprint;
  for (const source of snapshot.sources) {
    next.sources[source.sourceId] ||= {
      sourceId: source.sourceId,
      url: source.url,
      attemptCount: 0,
      failureCount: 0,
      consecutiveFailureCount: 0,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastCycleId: null,
      lastFailureReason: null,
      nextEligibleAt: null,
      lastProductiveAt: null
    };
  }
  next.activeCycle.cyclePositionStart = next.activeCycle.completedSourceIds?.length || 0;
  return next;
}

export function getPendingSources(state, snapshot) {
  const completed = new Set(state.activeCycle?.completedSourceIds || []);
  return snapshot.sources.filter((source) => !completed.has(source.sourceId));
}

export function selectShard(state, snapshot, shardSize, priorityUrls = []) {
  const size = Math.max(1, Number.parseInt(shardSize, 10) || 1);
  const priority = new Map(priorityUrls.map((url, index) => [normalizeUrl(url).toLowerCase(), index]));
  const pending = getPendingSources(state, snapshot).sort((a, b) => {
    const ai = priority.get(a.url.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const bi = priority.get(b.url.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.sourceId.localeCompare(b.sourceId);
  });
  if (!pending.length) return null;
  const shardNumber = state.activeCycle.nextShardNumber || 1;
  return {
    shardId: `${snapshot.cycleId}-shard-${String(shardNumber).padStart(4, "0")}`,
    shardNumber,
    cycleId: snapshot.cycleId,
    sourceIds: pending.slice(0, size).map((source) => source.sourceId),
    sources: pending.slice(0, size)
  };
}

export function recordSourceAttempt(state, source, outcome, at = new Date().toISOString()) {
  const current = state.sources[source.sourceId] || { sourceId: source.sourceId, url: source.url, attemptCount: 0, failureCount: 0, consecutiveFailureCount: 0 };
  const success = outcome.status === "SUCCESS" || outcome.status === "SUCCESS_NO_CANDIDATE" || outcome.status === "SUCCESS_PRODUCTIVE";
  current.attemptCount += 1;
  current.lastAttemptAt = at;
  current.lastCycleId = state.activeCycle?.cycleId || null;
  current.lastFailureReason = success ? null : (outcome.failureReason || outcome.status || "UNKNOWN_FAILURE");
  if (success) {
    current.lastSuccessAt = at;
    current.consecutiveFailureCount = 0;
    if (outcome.status === "SUCCESS_PRODUCTIVE") current.lastProductiveAt = at;
  } else {
    current.failureCount += 1;
    current.consecutiveFailureCount += 1;
  }
  state.sources[source.sourceId] = current;
  return current;
}

export function completeShard(state, shard, outcomes, completedAt = new Date().toISOString()) {
  const expected = new Set(shard.sourceIds);
  const accounted = outcomes.filter((outcome) => expected.has(outcome.sourceId));
  for (const outcome of accounted) recordSourceAttempt(state, outcome.source, outcome, completedAt);
  const completedIds = new Set(state.activeCycle.completedSourceIds || []);
  for (const outcome of accounted) completedIds.add(outcome.sourceId);
  state.activeCycle.completedSourceIds = [...completedIds].sort();
  state.activeCycle.completedShardIds = [...new Set([...(state.activeCycle.completedShardIds || []), shard.shardId])].sort();
  state.activeCycle.nextShardNumber = Math.max(state.activeCycle.nextShardNumber || 1, shard.shardNumber + 1);
  state.activeCycle.lastCheckpointAt = completedAt;
  state.activeCycle.cyclePositionEnd = state.activeCycle.completedSourceIds.length;
  return { accounted: accounted.length, expected: shard.sourceIds.length, complete: accounted.length === shard.sourceIds.length };
}

export function cycleProgress(state, snapshot) {
  const expected = snapshot.sources.length;
  const attempted = new Set(state.activeCycle?.completedSourceIds || []).size;
  return { totalActive: expected, attemptedThisCycle: attempted, remainingThisCycle: Math.max(0, expected - attempted), completedShards: state.activeCycle?.completedShardIds?.length || 0, remainingShards: Math.ceil(Math.max(0, expected - attempted) / Math.max(1, state.shardSize || 1)), coveragePercentage: expected ? (attempted / expected) * 100 : 100 };
}

export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

export async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temporary, file);
}

export async function acquireSchedulerLock(lockPath, owner = `${process.pid}-${Date.now()}`, ttlMs = DEFAULT_LOCK_TTL_MS) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const now = Date.now();
  try {
    const existing = JSON.parse(await fs.readFile(lockPath, "utf8"));
    if (existing.expiresAt > now && existing.owner !== owner) return { acquired: false, existing };
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const lock = { owner, acquiredAt: new Date(now).toISOString(), expiresAt: now + ttlMs };
  try {
    const handle = await fs.open(lockPath, "wx");
    await handle.writeFile(JSON.stringify(lock) + "\n");
    await handle.close();
    return { acquired: true, lock };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return { acquired: false, existing: await readJson(lockPath, null) };
  }
}

export async function releaseSchedulerLock(lockPath, owner) {
  try {
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
    if (lock.owner === owner) await fs.unlink(lockPath);
    return lock.owner === owner;
  } catch (error) { if (error.code === "ENOENT") return true; throw error; }
}
