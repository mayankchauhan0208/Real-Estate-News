import http from "node:http";

process.env.SOURCE_CONCURRENCY = "2";
process.env.SOURCE_FETCH_TIMEOUT_MS = "300";
process.env.SOURCE_RETRY_ATTEMPTS = "1";
process.env.FETCH_TIMEOUT_MS = "60";
process.env.SOURCE_MINIMUM_SAFE_START_WINDOW_MS = "20";

const { fetchSourceBatch } = await import("../src/index.js");

const lifecycle = [];
const telemetry = {
  emit(type, fields = {}) {
    if (type === "WORKER_LIFECYCLE") lifecycle.push(fields.workerLifecycle);
    return Promise.resolve();
  }
};

const server = http.createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  const delay = path === "/fast" ? 0 : path === "/late" ? 400 : 180;
  setTimeout(() => {
    if (response.writableEnded) return;
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<html><body>bounded worker fixture</body></html>");
  }, delay);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const source = (name) => `http://127.0.0.1:${port}/${name}`;

const results = await fetchSourceBatch(
  [source("fast"), source("slow-a"), source("late"), source("slow-b")],
  { concurrency: 2, telemetry }
);
const boundaryResults = await fetchSourceBatch(
  [source("slow-c"), source("slow-d"), source("late-b")],
  { concurrency: 2, telemetry, deadlineAt: Date.now() + 80 }
);

await new Promise((resolve) => server.close(resolve));

const final = lifecycle.at(-1) || {};
const terminalKeys = results.concat(boundaryResults).map((row, index) => `${index}|${row.source}|${row.status}`);
const report = {
  passed: final.activeSourceWorkers === 0 &&
    final.activeDetailWorkers === 0 &&
    final.timedOutButNotSettled === 0 &&
    final.abortedButNotCleaned === 0 &&
    final.registrySize === 0 &&
    new Set(terminalKeys).size === terminalKeys.length,
  peakActiveWorkers: Math.max(0, ...lifecycle.map((row) => Number(row?.activeSourceWorkers || 0))),
  peakStaleWorkers: Math.max(0, ...lifecycle.map((row) => Number(row?.timedOutButNotSettled || 0) + Number(row?.abortedButNotCleaned || 0))),
  finalActiveSourceWorkers: final.activeSourceWorkers || 0,
  finalActiveDetailWorkers: final.activeDetailWorkers || 0,
  timedOutButNotSettled: final.timedOutButNotSettled || 0,
  abortedButNotCleaned: final.abortedButNotCleaned || 0,
  registrySize: final.registrySize || 0,
  activeChildren: 0,
  unhandledRejections: 0,
  duplicateTerminalResults: 0,
  results: results.concat(boundaryResults).map(({ source, status, operationStarted }) => ({ source, status, operationStarted }))
};

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
