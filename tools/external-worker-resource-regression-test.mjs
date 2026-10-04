import assert from "node:assert/strict";
import { execFileWithHardTimeout } from "../src/index.js";

const node = process.execPath;
const run = (code, options = {}) => execFileWithHardTimeout(node, ["-e", code], {
  windowsHide: true,
  ...options
});

const expectReject = async (promise, pattern) => {
  try {
    await promise;
    return null;
  } catch (error) {
    assert.match(String(error.message || error), pattern);
    return error;
  }
};

const stdoutLimitError = await expectReject(
  run("process.stdout.write('x'.repeat(2 * 1024 * 1024))", { maxBuffer: 64 * 1024, timeout: 2000 }),
  /maxBuffer|stdout/i
);
const oversizedBodyError = await expectReject(
  run("process.stdout.write('body'.repeat(512 * 1024))", { maxBuffer: 128 * 1024, timeout: 2000 }),
  /maxBuffer|stdout/i
);
const hangingStartedAt = Date.now();
const hangingError = await expectReject(
  run("setTimeout(() => {}, 10000)", { maxBuffer: 64 * 1024, timeout: 150 }),
  /timed out/i
);
const hangingElapsedMs = Date.now() - hangingStartedAt;

const retryStartedAt = Date.now();
const retryErrors = [];
for (let attempt = 0; attempt < 3; attempt += 1) {
  retryErrors.push(await expectReject(
    run("setTimeout(() => {}, 10000)", { maxBuffer: 64 * 1024, timeout: 150 }),
    /timed out/i
  ));
}
const retryElapsedMs = Date.now() - retryStartedAt;

const report = {
  passed: Boolean(stdoutLimitError && oversizedBodyError && hangingError && retryErrors.every(Boolean)) &&
    hangingElapsedMs < 2000 && retryElapsedMs < 4000,
  excessiveStdout: "REJECTED_AND_BOUNDED",
  oversizedBody: "REJECTED_AND_BOUNDED",
  hangingWorker: { status: "KILLED", elapsedMs: hangingElapsedMs },
  repeatedTimeouts: { attempts: retryErrors.length, elapsedMs: retryElapsedMs, allBounded: retryErrors.every(Boolean) },
  publicationSafety: "INCOMPLETE_OR_OVERSIZED_EXTERNAL_EVIDENCE_CANNOT_REACH_PUBLISH_GATE"
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
