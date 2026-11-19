import assert from "node:assert/strict";
import { rankCoveragePriorityUrls } from "../src/index.js";
import { buildCycleSnapshot, createSchedulerState, selectShard, startOrResumeCycle } from "../src/source-monitor-scheduler.js";

const sources = [
  "https://example.test/national",
  "https://example.test/thin-a",
  "https://example.test/thin-b",
  "https://example.test/well-covered-a",
  "https://example.test/well-covered-b",
  "https://example.test/well-covered-c"
];
const cityCodes = new Map([
  ["https://example.test/thin-a", ["thin-city"]],
  ["https://example.test/thin-b", ["thin-city"]],
  ["https://example.test/well-covered-a", ["well-covered-city"]],
  ["https://example.test/well-covered-b", ["well-covered-city"]],
  ["https://example.test/well-covered-c", ["well-covered-city"]]
]);

const ranked = rankCoveragePriorityUrls(sources, cityCodes);
assert.deepEqual(ranked.slice(0, 2), [
  "https://example.test/thin-a",
  "https://example.test/thin-b"
]);
assert.equal(ranked.at(-1), "https://example.test/national");

const explicit = rankCoveragePriorityUrls(sources, cityCodes, ["https://example.test/national"]);
assert.equal(explicit[0], "https://example.test/national");
assert.equal(new Set(explicit).size, sources.length);
assert.deepEqual(new Set(explicit), new Set(sources));

const snapshot = buildCycleSnapshot(sources, "coverage-priority-test");
const schedulerState = startOrResumeCycle(createSchedulerState(), snapshot);
const shard = selectShard(schedulerState, snapshot, 2, ranked);
assert.deepEqual(
  shard.sources.map((source) => source.url),
  ["https://example.test/thin-a", "https://example.test/thin-b"],
  "the resumable scheduler must select thin-city sources first when it receives coverage priorities"
);

console.log("COVERAGE_PRIORITY_REGRESSION=PASS");
