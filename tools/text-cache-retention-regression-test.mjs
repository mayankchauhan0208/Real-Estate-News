import assert from "node:assert/strict";
import { getMemorySnapshot, getRejectionReasons } from "../src/index.js";

const batchSize = 50;
const bodySize = 1200;

function makeArticle(batch, index) {
  return {
    title: `Housing project update ${batch}-${index}`,
    description: `Positive residential development announcement ${batch}-${index}`,
    articleText: `${"Property development and housing project evidence ".repeat(30)}${batch}-${index}`.slice(0, bodySize),
    newsLink: `https://example.test/news/${batch}-${index}`,
    cityCode: "gurugram",
    publishedAt: "2026-09-30T00:00:00.000Z",
    fullArticleRead: true,
    isActive: true
  };
}

function evaluateBatch(batch) {
  let publishable = 0;
  let rejected = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const reasons = getRejectionReasons(makeArticle(batch, index), new Set());
    if (reasons.length === 0) publishable += 1;
    else rejected += 1;
  }
  return { publishable, rejected };
}

function collect() {
  if (typeof global.gc === "function") global.gc();
}

collect();
const before = getMemorySnapshot();
const first = evaluateBatch(1);
collect();
const plateau = getMemorySnapshot();
const second = evaluateBatch(2);
collect();
const after = getMemorySnapshot();

assert.deepEqual(first, second, "decision output changed between identical batches");
assert.equal(first.publishable + first.rejected, batchSize);

const retainedHeapDelta = after.heapUsed - before.heapUsed;
assert.ok(
  retainedHeapDelta < 64 * 1024 * 1024,
  `text evaluation retained too much heap: ${retainedHeapDelta} bytes`
);

console.log(JSON.stringify({
  passed: true,
  inputArticles: batchSize * 2,
  inputBytes: batchSize * 2 * bodySize,
  decisions: first,
  before,
  plateau,
  after,
  retainedHeapDelta,
  lifecycle: "full-text keyword evaluation does not retain per-article cache entries"
}, null, 2));
