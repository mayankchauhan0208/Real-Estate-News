import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquireSchedulerLock, releaseSchedulerLock } from "../src/source-monitor-scheduler.js";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brokket-publication-lock-"));
const lockPath = path.join(dir, "publication.lock");
const [first, second] = await Promise.all([
  acquireSchedulerLock(lockPath, "worker-a", 60_000),
  acquireSchedulerLock(lockPath, "worker-b", 60_000)
]);
const winners = [first, second].filter((result) => result.acquired);
assert.equal(winners.length, 1);
const winner = first.acquired ? "worker-a" : "worker-b";
const loser = first.acquired ? second : first;
assert.equal(loser.acquired, false);
assert.equal(await releaseSchedulerLock(lockPath, winner), true);

const retry = await acquireSchedulerLock(lockPath, "worker-b", 60_000);
assert.equal(retry.acquired, true);
await releaseSchedulerLock(lockPath, "worker-b");
await fs.rm(dir, { recursive: true, force: true });
console.log(JSON.stringify({ passed: true, raceWinners: 1, duplicatePublicationWindow: 0, retryAfterRelease: true }));
