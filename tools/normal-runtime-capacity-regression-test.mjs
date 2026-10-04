import http from "node:http";

process.env.SOURCE_CONCURRENCY = "1";
process.env.SOURCE_FETCH_TIMEOUT_MS = "500";
process.env.SOURCE_RETRY_ATTEMPTS = "1";
process.env.FETCH_TIMEOUT_MS = "300";
process.env.SOURCE_MINIMUM_SAFE_START_WINDOW_MS = "25";

const { fetchSourceBatch } = await import("../src/index.js");
const requestLog = [];
const server = http.createServer((request, response) => {
  requestLog.push({ path: new URL(request.url, "http://127.0.0.1").pathname, at: Date.now() });
  setTimeout(() => {
    if (!response.writableEnded) {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html><head><title>source</title></head><body>empty</body></html>");
    }
  }, 120);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const sources = Array.from({ length: 8 }, (_, index) => `http://127.0.0.1:${port}/source-${index}`);
const startedAt = Date.now();
const results = await fetchSourceBatch(sources, {
  deadlineAt: startedAt + 350,
  signal: AbortSignal.timeout(350),
  mode: "capacity-regression"
});
await new Promise((resolve) => server.close(resolve));

const deferred = results.filter((row) => row.status === "DEFERRED_BY_GLOBAL_BOUNDARY");
const started = results.filter((row) => row.operationStarted === true);
const oldBucket = results.filter((row) => row.error && /source budget exhausted before operation/i.test(row.error));
const report = {
  passed: results.length === sources.length &&
    deferred.length > 0 &&
    started.length > 0 &&
    deferred.every((row) => row.operationStarted === false) &&
    oldBucket.length === 0 &&
    requestLog.length <= started.length,
  sourceCount: sources.length,
  accounted: results.length,
  started: started.length,
  deferred: deferred.length,
  budgetExhaustedBeforeOperation: oldBucket.length,
  requests: requestLog.length,
  terminalStatuses: Object.fromEntries(
    [...new Set(results.map((row) => row.status))]
      .map((status) => [status, results.filter((row) => row.status === status).length])
  )
};

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
