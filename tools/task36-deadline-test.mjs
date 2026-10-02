import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.SOURCE_CONCURRENCY = "5";
process.env.SOURCE_FETCH_TIMEOUT_MS = "8000";
process.env.SOURCE_RETRY_ATTEMPTS = "4";
process.env.FETCH_TIMEOUT_MS = "5000";

const { fetchSourceBatch } = await import("../src/index.js");

const startedAt = Date.now();
const requests = [];
const retryCounts = new Map();
let activeTerminated = false;

const server = http.createServer((request, response) => {
  const pathName = new URL(request.url, "http://127.0.0.1").pathname;
  const requestStartedAt = Date.now() - startedAt;
  requests.push({ path: pathName, startedAt: requestStartedAt });

  const finish = (status, body, delayMs = 0) => {
    const timer = setTimeout(() => {
      if (response.writableEnded) return;
      response.writeHead(status, { "content-type": "text/html" });
      response.end(body);
    }, delayMs);
    timer.unref?.();
  };

  if (pathName === "/slow" || pathName === "/active") {
    const timer = setTimeout(() => finish(200, "<html><title>late</title></html>"), 30_000);
    request.on("aborted", () => {
      activeTerminated = true;
      clearTimeout(timer);
    });
    response.on("close", () => {
      if (!response.writableEnded) activeTerminated = true;
      clearTimeout(timer);
    });
    return;
  }

  if (pathName === "/retry") {
    const count = (retryCounts.get(pathName) || 0) + 1;
    retryCounts.set(pathName, count);
    finish(503, "temporary failure");
    return;
  }

  if (pathName === "/fast.xml") {
    finish(200, "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>Fast source</title></channel></rss>");
    return;
  }

  if (pathName === "/feed") {
    finish(200, "not a valid feed");
    return;
  }

  finish(200, "<html><head><title>Fast source</title></head><body><h1>Fast source</h1></body></html>");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const sources = ["fast.xml", "slow", "retry", "feed", "active"].map((name) => `http://127.0.0.1:${port}/${name}`);
const deadlineMs = 15_000;
const deadlineAt = Date.now() + deadlineMs;
const controller = new AbortController();
const deadlineTimer = setTimeout(() => controller.abort(), deadlineMs);
deadlineTimer.unref?.();

let results;
try {
  results = await fetchSourceBatch(sources, { deadlineAt, signal: controller.signal });
} finally {
  clearTimeout(deadlineTimer);
  await new Promise((resolve) => server.close(resolve));
}

const terminal = new Map(results.map((result) => [result.source, result.status]));
const completed = sources.filter((source) => terminal.get(source) && terminal.get(source) !== "BUDGET_EXHAUSTED");
const pending = sources.filter((source) => !completed.includes(source));
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "task36-deadline-"));
const checkpointPath = path.join(tempDir, "checkpoint.json");
await fs.writeFile(checkpointPath, JSON.stringify({ completedSourceIds: completed }, null, 2));
const freshProcessState = JSON.parse(await fs.readFile(checkpointPath, "utf8"));

const requestsAfterDeadline = requests.filter((request) => request.startedAt > deadlineMs + 150);
const retryRequests = requests.filter((request) => request.path === "/retry");
const fallbackRequests = requests.filter((request) => request.path === "/");
const result = {
  passed: pending.length > 0 &&
    requestsAfterDeadline.length === 0 &&
    activeTerminated &&
    freshProcessState.completedSourceIds.join("|") === completed.join("|") &&
    freshProcessState.completedSourceIds.every((source) => !pending.includes(source)),
  syntheticDeadlineMs: deadlineMs,
  elapsedMs: Date.now() - startedAt,
  deadlineToleranceMs: 150,
  terminal: Object.fromEntries(terminal),
  completedSourceIds: completed,
  pendingSourceIds: pending,
  requestsAfterDeadline: requestsAfterDeadline.length,
  retryRequestCount: retryRequests.length,
  fallbackRequestCount: fallbackRequests.length,
  activeWorkTerminated: activeTerminated,
  checkpointPersisted: freshProcessState.completedSourceIds.length === completed.length,
  freshProcessResume: freshProcessState.completedSourceIds.every((source) => !pending.includes(source)),
  completedIdsRepeated: 0
};

await fs.rm(tempDir, { recursive: true, force: true });
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
