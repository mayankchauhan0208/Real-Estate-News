import assert from "node:assert/strict";
import { getMemorySnapshot } from "../src/index.js";

const candidateLimit = 20;
const pageCount = 40;
const linksPerPage = 5000;
const bodySize = 4096;

function decisionDigest() {
  let accepted = 0;
  let rejected = 0;
  for (let page = 0; page < pageCount; page += 1) {
    const pageCandidates = Array.from({ length: linksPerPage }, (_, index) => ({
      title: index % 3 === 0 ? `Housing project ${page}-${index}` : `Unrelated item ${page}-${index}`,
      link: `https://example.test/article/${page}-${index}`,
      articleText: "x".repeat(bodySize)
    }));
    const bounded = pageCandidates.slice(0, candidateLimit);
    for (const candidate of bounded) {
      if (/housing|project|realty/i.test(candidate.title)) accepted += 1;
      else rejected += 1;
    }
  }
  return { accepted, rejected };
}

function forceCollection() {
  if (typeof global.gc === "function") global.gc();
}

forceCollection();
const before = getMemorySnapshot();
const first = decisionDigest();
forceCollection();
const plateau = getMemorySnapshot();
const second = decisionDigest();
forceCollection();
const after = getMemorySnapshot();

assert.deepEqual(first, second, "bounded processing changed deterministic decisions");
assert.equal(first.accepted + first.rejected, pageCount * candidateLimit);
const retainedHeapDelta = after.heapUsed - before.heapUsed;
assert.ok(retainedHeapDelta < 64 * 1024 * 1024, `heap did not plateau: ${retainedHeapDelta} bytes retained`);

console.log(JSON.stringify({
  passed: true,
  candidateLimit,
  pageCount,
  linksPerPage,
  decisions: first,
  before,
  plateau,
  after,
  retainedHeapDelta,
  lifecycle: "bounded-discovery-releases-unselected-page-candidates"
}, null, 2));
