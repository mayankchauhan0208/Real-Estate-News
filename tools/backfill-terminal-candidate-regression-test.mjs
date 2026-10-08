import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const stateDir = mkdtempSync(path.join(tmpdir(), "brokket-terminal-stream-"));
process.env.NEWS_STATE_DIR = stateDir;

const {
  backfillStreamArticleKey,
  buildRegionalMetrics,
  createBackfillTerminalStream,
  getRejectionReasons
} = await import(`../src/index.js?terminal-regression=${Date.now()}`);

try {
  const article = {
    title: "UP RERA approves named residential project in Noida",
    description: "UP RERA approved a new residential project with 420 homes in Noida.",
    articleText: "UP RERA approved registration of a named residential project with 420 homes in Noida. ".repeat(20),
    newsLink: "https://up-rera.in/documents/project-approval.pdf",
    sourceUrl: "https://up-rera.in/documents/project-approval.pdf",
    documentUrl: "https://up-rera.in/documents/project-approval.pdf",
    thumbnailImage: "https://up-rera.in/thumbnails/project-approval.jpg",
    postedBy: "UP RERA",
    postedByLogo: "https://up-rera.in/favicon.ico",
    publishedAt: "2026-09-22T00:00:00.000Z",
    createdAt: "2026-09-22T00:00:00.000Z",
    cityCode: "noida",
    cityCodes: ["noida"],
    language: "English",
    fullArticleRead: true,
    articleReadAttempted: true,
    authoritativeContent: true,
    officialDocumentRead: true,
    directDocumentVerified: true,
    regionalSource: true,
    sourceMode: "AUTO_PUBLISH",
    authorityEventType: "MEANINGFUL_PROPERTY_EVENT",
    cityConfidence: "exact"
  };

  assert.deepEqual(getRejectionReasons(article, new Set()), []);
  const stream = createBackfillTerminalStream();
  const record = stream.append(article, [], "WOULD_PUBLISH");
  assert.ok(record);
  assert.equal(backfillStreamArticleKey(record), backfillStreamArticleKey(article), "persisted identity must survive projection");
  assert.equal(record.postedBy, "UP RERA");
  assert.equal(record.thumbnailImage, article.thumbnailImage);
  assert.equal(record.directDocumentVerified, true);
  assert.equal(record.schemaVersion, 2);
  assert.deepEqual(getRejectionReasons(record, new Set()), [], "persisted candidate must remain publishable after process resume");

  const persisted = JSON.parse(readFileSync(stream.paths.recordsPath, "utf8").trim());
  assert.equal(backfillStreamArticleKey(persisted), backfillStreamArticleKey(article));
  assert.deepEqual(getRejectionReasons(persisted, new Set()), []);

  const metrics = buildRegionalMetrics([
    record,
    { ...record, id: "geo-reject", cityCode: "hyderabad", cityConfidence: "uncertain" },
    { ...record, id: "content-reject", title: "General commentary" }
  ], (candidate) => {
    if (candidate.id === "geo-reject") return ["review: uncertain event geography"];
    if (candidate.id === "content-reject") return ["filter 10: commentary without a concrete material property event"];
    return [];
  });
  assert.equal(metrics.relevantSafe, 2, "content rejection must not be reported as relevance-safe");
  assert.equal(metrics.geoValid, 2, "uncertain geography must not be reported as geo-valid");
  assert.equal(metrics.geoUncertain, 1);
  assert.equal(metrics.wouldAutoPublish, 1);

  console.log("Backfill terminal candidate identity, rehydration, and regional accounting regression passed.");
} finally {
  rmSync(stateDir, { recursive: true, force: true });
}
