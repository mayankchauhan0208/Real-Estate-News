import assert from "node:assert/strict";
import {
  buildCycleSnapshot,
  createSchedulerState,
  selectShard,
  startOrResumeCycle
} from "../src/source-monitor-scheduler.js";

const source = (name) => ({ url: `https://task35-${name}.example.test/feed` });
const ids = (snapshot) => snapshot.sources.map((item) => item.sourceId);
const stateWithCompleted = (snapshot, completedIds) => {
  const state = startOrResumeCycle({ ...createSchedulerState(), shardSize: 50 }, snapshot);
  state.activeCycle.completedSourceIds = [...completedIds].sort();
  return state;
};
const pendingIds = (state, snapshot) => new Set(selectShard(state, snapshot, snapshot.sources.length)?.sourceIds || []);

// A: adding a source preserves completed IDs and leaves only C, D, E pending.
{
  const oldSnapshot = buildCycleSnapshot(["A", "B", "C", "D"].map(source), "task35-a");
  const newSnapshot = buildCycleSnapshot(["A", "B", "C", "D", "E"].map(source), "task35-a");
  const state = startOrResumeCycle(stateWithCompleted(oldSnapshot, ids(oldSnapshot).slice(0, 2)), newSnapshot);
  assert.deepEqual(state.activeCycle.completedSourceIds, ids(oldSnapshot).slice(0, 2).sort());
  assert.equal(pendingIds(state, newSnapshot).size, 3);
}

// B: removing a source drops it safely from the current universe.
{
  const oldSnapshot = buildCycleSnapshot(["A", "B", "C", "D"].map(source), "task35-b");
  const newSnapshot = buildCycleSnapshot(["A", "B", "D"].map(source), "task35-b");
  const state = startOrResumeCycle(stateWithCompleted(oldSnapshot, ids(oldSnapshot).slice(0, 2)), newSnapshot);
  assert.deepEqual(state.activeCycle.completedSourceIds, ids(oldSnapshot).slice(0, 2).sort());
  assert.equal(pendingIds(state, newSnapshot).size, 1);
}

// C: reordering does not reselect completed IDs.
{
  const oldSnapshot = buildCycleSnapshot(["A", "B", "C", "D"].map(source), "task35-c");
  const newSnapshot = buildCycleSnapshot(["D", "C", "B", "A"].map(source), "task35-c");
  const state = startOrResumeCycle(stateWithCompleted(oldSnapshot, ids(oldSnapshot).slice(0, 2)), newSnapshot);
  const pending = pendingIds(state, newSnapshot);
  assert.equal([...pending].some((id) => ids(oldSnapshot).slice(0, 2).includes(id)), false);
  assert.equal(pending.size, 2);
}

// D: adding 18 regional sources to the old 553-source universe does not reset 214 completed IDs.
{
  const oldSnapshot = buildCycleSnapshot(Array.from({ length: 553 }, (_, index) => source(`old-${index}`)), "task35-d");
  const newSnapshot = buildCycleSnapshot([
    ...Array.from({ length: 553 }, (_, index) => source(`old-${index}`)),
    ...Array.from({ length: 18 }, (_, index) => source(`regional-${index}`))
  ], "task35-d");
  const completed = ids(oldSnapshot).slice(0, 214);
  const state = startOrResumeCycle(stateWithCompleted(oldSnapshot, completed), newSnapshot);
  assert.equal(state.activeCycle.completedSourceIds.length, 214);
  assert.equal(pendingIds(state, newSnapshot).size, 357);
}

// E: production-like fresh process restores 413 completed and selects only 158 pending.
{
  const snapshot = buildCycleSnapshot(Array.from({ length: 571 }, (_, index) => source(`prod-${index}`)), "task35-e");
  const completed = ids(snapshot).slice(0, 413);
  const state = stateWithCompleted(snapshot, completed);
  const restored = startOrResumeCycle(state, snapshot);
  const pending = pendingIds(restored, snapshot);
  assert.equal(restored.activeCycle.completedSourceIds.length, 413);
  assert.equal(pending.size, 158);
  assert.equal([...pending].some((id) => completed.includes(id)), false);
}

// F: current production checkpoint restores 507 completed and selects only 64 pending.
{
  const snapshot = buildCycleSnapshot(Array.from({ length: 571 }, (_, index) => source(`current-${index}`)), "task35-current");
  const completed = ids(snapshot).slice(0, 507);
  const state = stateWithCompleted(snapshot, completed);
  const restored = startOrResumeCycle(state, snapshot);
  const pending = pendingIds(restored, snapshot);
  assert.equal(restored.activeCycle.completedSourceIds.length, 507);
  assert.equal(pending.size, 64);
  assert.equal([...pending].some((id) => completed.includes(id)), false);
}

console.log(JSON.stringify({
  passed: true,
  addSource: "PASS",
  removeSource: "PASS",
  reorder: "PASS",
  regionalExpansion: "PASS",
  productionRestore: "PASS",
  currentCheckpoint: "PASS",
  repeatedCompletedIds: 0
}));
