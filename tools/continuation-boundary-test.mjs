import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCycleSnapshot, createSchedulerState, selectShard, startOrResumeCycle, completeShard, writeJsonAtomic } from "../src/source-monitor-scheduler.js";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "brokket-continuation-"));
process.env.NEWS_STATE_DIR = tempRoot;
process.env.NEWS_RUN_REPORTS_DIR = path.join(tempRoot, "reports");
const { persistCycleSourceResults, readCycleSourceResults, prepareResumableSourceCycle } = await import("../src/index.js");

const sources = ["https://fixture.test/a", "https://fixture.test/b", "https://fixture.test/c"];
const snapshot = buildCycleSnapshot(sources, "fixture-cycle");
const state = startOrResumeCycle(createSchedulerState(), snapshot);
state.shardSize = 2;
const firstShard = selectShard(state, snapshot, 2);
assert.equal(firstShard.sources.length, 2);

const firstResults = new Map(firstShard.sources.map((source, index) => [source.sourceId, {
  source: source.url,
  status: "SUCCESS_PRODUCTIVE",
  articles: [{
    title: `Candidate ${index}`,
    newsLink: `https://fixture.test/article-${index}`,
    finalState: index === 0 ? "CANDIDATE" : "REVIEW",
    rejectionReasons: index === 0 ? [] : ["review: insufficient evidence"]
  }],
  attempts: 1
}]));
completeShard(state, firstShard, [...firstResults.entries()].map(([sourceId, result]) => ({ sourceId, source: { url: result.source }, status: result.status })));
const context = { state, snapshot };
await persistCycleSourceResults(snapshot.cycleId, firstResults, context);

const restored = await readCycleSourceResults(snapshot.cycleId);
assert.equal(restored.size, 2);
assert.equal(restored.get([...firstResults.keys()][0]).articles[0].finalState, "CANDIDATE");
assert.equal(restored.get([...firstResults.keys()][1]).articles[0].finalState, "REVIEW");

const resumedShard = selectShard(state, snapshot, 2);
assert.equal(resumedShard.sources.length, 1);
assert.equal(firstResults.has(resumedShard.sources[0].sourceId), false);
const secondResult = new Map([[resumedShard.sources[0].sourceId, {
  source: resumedShard.sources[0].url,
  status: "SUCCESS_NO_CANDIDATE",
  articles: [],
  attempts: 1
}]]);
completeShard(state, resumedShard, [{ sourceId: resumedShard.sources[0].sourceId, source: { url: resumedShard.sources[0].url }, status: "SUCCESS_NO_CANDIDATE" }]);
await persistCycleSourceResults(snapshot.cycleId, new Map([...restored, ...secondResult]), context);

const final = await readCycleSourceResults(snapshot.cycleId);
assert.equal(final.size, 3);
assert.equal(final.get(resumedShard.sources[0].sourceId).status, "SUCCESS_NO_CANDIDATE");
assert.equal(state.activeCycle.completedSourceIds.length, snapshot.sources.length);
assert.equal(selectShard(state, snapshot, 2), null);

// A day boundary cannot restart a matching incomplete source universe and
// starve its final shard.
process.env.SOURCE_CYCLE_ID = "day-one";
const dateBoundary = await prepareResumableSourceCycle(sources);
const dateBoundaryShard = selectShard(dateBoundary.state, dateBoundary.snapshot, 2);
completeShard(dateBoundary.state, dateBoundaryShard, dateBoundaryShard.sources.map((source) => ({ source, sourceId: source.sourceId, status: "SUCCESS_NO_CANDIDATE" })));
await writeJsonAtomic(dateBoundary.statePath, dateBoundary.state);
process.env.SOURCE_CYCLE_ID = "day-two";
const resumedAcrossDate = await prepareResumableSourceCycle(sources);
assert.equal(resumedAcrossDate.snapshot.cycleId, "day-one");
assert.equal(selectShard(resumedAcrossDate.state, resumedAcrossDate.snapshot, 2).sources.length, 1);
const expandedSources = [...sources, "https://fixture.test/d"];
const remainingOriginalSource = sources.find((sourceUrl) => !dateBoundaryShard.sources.some((source) => source.url === sourceUrl));
process.env.SOURCE_CYCLE_ID = "day-three";
const resumedAcrossUniverseChange = await prepareResumableSourceCycle(expandedSources);
const migratedShard = selectShard(resumedAcrossUniverseChange.state, resumedAcrossUniverseChange.snapshot, 3);
assert.equal(resumedAcrossUniverseChange.snapshot.cycleId, "day-one");
assert.deepEqual(new Set(migratedShard.sources.map((source) => source.url)), new Set([
  remainingOriginalSource,
  "https://fixture.test/d"
]));
delete process.env.SOURCE_CYCLE_ID;

console.log(JSON.stringify({
  passed: true,
  firstAccounted: firstResults.size,
  resumedPending: 1,
  finalAccounted: final.size,
  candidatePreserved: final.get([...firstResults.keys()][0]).articles.length === 1,
  reviewPreserved: final.get([...firstResults.keys()][1]).articles.length === 1,
  noDuplicateResume: selectShard(state, snapshot, 2) === null,
  dateBoundaryTailPreserved: true,
  universeChangeTailPreserved: true
}));

await fs.rm(tempRoot, { recursive: true, force: true });
