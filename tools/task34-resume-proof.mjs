import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildCycleSnapshot,
  completeShard,
  createSchedulerState,
  cycleProgress,
  readJson,
  selectShard,
  startOrResumeCycle,
  writeJsonAtomic
} from "../src/source-monitor-scheduler.js";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "task34-resume-"));
const statePath = path.join(dir, "checkpoint.json");
const sources = Array.from({ length: 553 }, (_, index) => ({ url: `https://task34-${index}.example.test/feed` }));
const snapshot = buildCycleSnapshot(sources, "task34-cycle");
const outcome = (source) => ({ source, sourceId: source.sourceId, status: "SUCCESS_NO_CANDIDATE" });

// Run A simulates a runner that terminates after two bounded shards.
let runA = startOrResumeCycle({ ...createSchedulerState(), shardSize: 50 }, snapshot);
const runASources = new Set();
for (let index = 0; index < 2; index += 1) {
  const shard = selectShard(runA, snapshot, 50);
  assert.ok(shard);
  completeShard(runA, shard, shard.sources.map(outcome), "2026-10-02T00:00:00.000Z");
  shard.sourceIds.forEach((id) => runASources.add(id));
}
await writeJsonAtomic(statePath, runA);

// Run B starts with a clean process context and must select the next shard.
const restored = await readJson(statePath, createSchedulerState());
const runB = startOrResumeCycle(restored, snapshot);
const nextShard = selectShard(runB, snapshot, 50);
assert.ok(nextShard);
assert.equal(nextShard.sourceIds.some((id) => runASources.has(id)), false);

let completed = runB;
while (true) {
  const shard = selectShard(completed, snapshot, 50);
  if (!shard) break;
  completeShard(completed, shard, shard.sources.map(outcome), "2026-10-02T00:01:00.000Z");
}
const progress = cycleProgress(completed, snapshot);
assert.equal(progress.attemptedThisCycle, 553);
assert.equal(progress.remainingThisCycle, 0);

console.log(JSON.stringify({
  passed: true,
  runAStartPosition: 0,
  runAEndPosition: runASources.size,
  runBStartPosition: runASources.size,
  runBRepeatedRunASources: 0,
  cycleCompleted: progress.remainingThisCycle === 0,
  universeFingerprint: snapshot.universeFingerprint
}));
