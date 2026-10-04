import http from "node:http";

process.env.SOURCE_CONCURRENCY = "1";
process.env.SOURCE_FETCH_TIMEOUT_MS = "120";
process.env.SOURCE_RETRY_ATTEMPTS = "4";
process.env.FETCH_TIMEOUT_MS = "80";
process.env.SOURCE_MINIMUM_SAFE_START_WINDOW_MS = "25";

const { fetchSourceBatch } = await import("../src/index.js");

const server = http.createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  if (path === "/slow") {
    setTimeout(() => {
      if (!response.writableEnded) {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<html><body>slow source</body></html>");
      }
    }, 250);
    return;
  }

  if (path === "/retry") {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("temporary failure");
    return;
  }

  response.writeHead(200, { "content-type": "text/html" });
  response.end("<html><body>fast source</body></html>");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const source = (name) => `http://127.0.0.1:${port}/${name}`;

const slow = await fetchSourceBatch([source("slow")], { deadlineAt: Date.now() + 1000 });
const retry = await fetchSourceBatch([source("retry")], { deadlineAt: Date.now() + 1000 });
const queued = await fetchSourceBatch(
  [source("fast-1"), source("fast-2"), source("fast-3"), source("fast-4")],
  { deadlineAt: Date.now() + 800 }
);
const globalBoundary = await fetchSourceBatch([source("fast-boundary")], {
  deadlineAt: Date.now() - 1
});

await new Promise((resolve) => server.close(resolve));

const all = [...slow, ...retry, ...queued, ...globalBoundary];
const oldBucket = all.filter((row) => /source budget exhausted before operation/i.test(row.error || ""));
const preWorker = all.filter((row) => row.operationStarted !== true);
const afterExecution = all.filter((row) => row.status === "SOURCE_TIMEOUT_AFTER_EXECUTION");
const deferred = all.filter((row) => row.status === "DEFERRED_BY_GLOBAL_BOUNDARY");

const report = {
  passed: oldBucket.length === 0 &&
    slow[0]?.status === "SOURCE_TIMEOUT_AFTER_EXECUTION" &&
    retry[0]?.status === "SOURCE_TIMEOUT_AFTER_EXECUTION" &&
    globalBoundary[0]?.status === "DEFERRED_BY_GLOBAL_BOUNDARY" &&
    globalBoundary[0].operationStarted === false &&
    deferred.every((row) => row.operationStarted === false) &&
    afterExecution.length >= 2,
  oldBudgetExhaustionCount: oldBucket.length,
  slowDiscovery: slow[0],
  retryNearDeadline: retry[0],
  queuedFastSources: queued,
  globalBoundary: globalBoundary[0],
  preWorkerTerminals: preWorker.map(({ source, status, operationStarted, error }) => ({ source, status, operationStarted, error })),
  afterExecutionCount: afterExecution.length,
  deferredByGlobalBoundaryCount: deferred.length
};

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
