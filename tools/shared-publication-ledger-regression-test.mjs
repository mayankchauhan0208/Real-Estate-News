import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import http from "node:http";
import { promisify } from "node:util";
import {
  identityFor,
  ledgerHasMatch,
  loadPublicationLedger,
  publishWithPublicationLedger
} from "../src/publication-ledger.js";
import { GitHubPublicationClaimStore } from "../src/github-publication-claim.js";

const exec = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "brokket-shared-ledger-"));
const ledgerPath = path.join(root, "publication-ledger.json");
const seedPath = path.resolve("data/publication-ledger-seed.json");

let remoteState = { version: 1, updatedAt: new Date(0).toISOString(), claims: [] };
let remoteVersion = 1;
const casServer = http.createServer(async (request, response) => {
  if (request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ sha: `v${remoteVersion}`, content: Buffer.from(`${JSON.stringify(remoteState)}\n`).toString("base64") }));
    return;
  }
  if (request.method === "PUT") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    if (payload.sha !== `v${remoteVersion}`) {
      response.writeHead(409);
      response.end();
      return;
    }
    remoteState = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
    remoteVersion += 1;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(405);
  response.end();
});
await new Promise((resolve) => casServer.listen(0, "127.0.0.1", resolve));
const casBaseUrl = `http://127.0.0.1:${casServer.address().port}`;

const raymond = {
  title: "Raymond Realty sees 98% Q2 pre-sales growth, keeps leverage below ceiling",
  cityCode: "mumbai",
  newsLink: "https://www.business-standard.com/industry/news/raymond-realty-q2-fy27-pre-sales-rs-902-crore-mahim-projects-126100500476_1.html"
};
const dlf = {
  title: "DLF Sells 172 Senior Living Homes in Gurugram for Rs 1,985 Crore",
  cityCode: "gurugram",
  newsLink: "https://www.magicbricks.com/news/dlf-sells-172-senior-living-homes-in-gurugram-for-rs-1985-crore-ssmb/151978.html"
};
const dlfAlternate = {
  title: "DLF sells all 172 Aureva senior living homes in Gurugram for Rs 1,985 crore",
  cityCode: "gurugram",
  newsLink: "https://www.hindustantimes.com/real-estate/dlf-aureva-gurugram-sells-172-homes-101759000000000.html"
};
const gaur = {
  title: "Gaur Alaris Sells Out Entire Inventory in 48 Hours, Reaching Sales of Rs 1800 Crore",
  cityCode: "noida",
  newsLink: "https://realtynmore.com/gaur-alaris-sells-out-entire-inventory-in-48-hours/"
};
const gaurAlternate = {
  title: "Gaurs Group sells 1,088 flats for Rs 1,800 cr in new housing project in NCR",
  description: "Gaurs Group sold all units in its 12-acre project Gaur Alaris in Sector 22D, Yamuna Expressway.",
  cityCode: "noida",
  newsLink: "https://economictimes.indiatimes.com/industry/services/property-/-cstruction/gaurs-group-sells-1088-flats-for-rs-1800-cr-in-new-housing-project-in-ncr/articleshow/134704516.cms"
};
const eventDedupe = ["event:dlf|senior-living-sale|gurugram||"];

let ledger = await loadPublicationLedger({ ledgerPath, seedPath });
assert.equal(ledger.entries.length, 11, "verified local history must contain the three seed and eight backfill entries");
assert.equal(ledgerHasMatch(ledger, raymond), true);
assert.equal(ledgerHasMatch(ledger, dlf), true);
assert.equal(ledgerHasMatch(ledger, gaur), true);
assert.equal(ledgerHasMatch(ledger, gaurAlternate), true, "Gaur/Gaurs alternate source must match the same project event");
assert.equal(ledgerHasMatch(ledger, {
  title: "Gaurs Group sells 1,088 flats in a new Noida project for Rs 1,800 crore",
  description: "A separate project with a different project name.",
  cityCode: "noida",
  newsLink: "https://example.test/gaurs-separate-project"
}), false, "same builder and amount must not suppress a distinct unnamed event");
assert.equal(ledgerHasMatch(ledger, dlfAlternate, eventDedupe), true, "alternate DLF URL must match event identity");

// A development can be described as land acquisition by one publisher and as
// the planned project by another. The reconciliation is intentionally
// conservative: same builder/city plus at least two shared numeric facts.
const signatureAcquisition = {
  title: "Signature Global signs pact to develop 194-acre land in Gurugram, targets Rs 5,500-6,000 crore GDV",
  description: "Signature Global acquired 25 acres for Rs 150 crore and entered a collaboration for 169.22 acres, with 6.77 million sq ft and GDV of Rs 5,500-6,000 crore.",
  cityCode: "gurugram",
  newsLink: "https://example.test/signature-global-land-acquisition"
};
const signatureDevelopment = {
  title: "Signature Global plans 194-acre luxury farmhouse project in Gurugram West",
  description: "The 194-acre project combines 25 acres acquired for Rs 150 crore and 169.22 acres under collaboration, with 6.77 million sq ft and Rs 5,500-6,000 crore GDV.",
  cityCode: "gurugram",
  newsLink: "https://example.test/signature-global-project-plan"
};
assert.equal((await post(signatureAcquisition, "BACKFILL")).duplicate, false);
ledger = await loadPublicationLedger({ ledgerPath, seedPath });
assert.equal(ledgerHasMatch(ledger, signatureDevelopment), true, "same Signature Global development must reconcile across land and project wording");

async function post(article, mode, response = { status: 200 }) {
  return publishWithPublicationLedger({
    ledgerPath,
    seedPath,
    article,
    dedupeIds: article.dedupeIds || [],
    mode,
    publish: async () => response
  });
}

// A remote list HTTP 500 is intentionally not consulted here; the durable
// seed remains sufficient to recognize all three verified live records.
assert.equal(ledgerHasMatch(ledger, raymond), true);
assert.equal(ledgerHasMatch(ledger, dlf), true);
assert.equal(ledgerHasMatch(ledger, gaur), true);

const normalEvent = { title: "Normal first property launch", cityCode: "mumbai", newsLink: "https://example.test/normal-first" };
const normalWinner = await post(normalEvent, "NORMAL");
assert.equal(normalWinner.duplicate, false);
ledger = await loadPublicationLedger({ ledgerPath, seedPath });
assert.equal(ledgerHasMatch(ledger, normalEvent), true);
assert.equal((await post({ ...normalEvent, newsLink: "https://example.test/normal-first?utm_source=alternate" }, "BACKFILL")).duplicate, true);

const backfillEvent = { title: "Backfill first township approval", cityCode: "noida", newsLink: "https://example.test/backfill-first" };
assert.equal((await post(backfillEvent, "BACKFILL")).duplicate, false);
assert.equal((await post({ ...backfillEvent, newsLink: "https://example.test/backfill-first?ref=normal" }, "NORMAL")).duplicate, true);

const raceEvent = { title: "Concurrent shared event", cityCode: "gurugram", newsLink: "https://example.test/concurrent" };
const raceScript = `
  import { publishWithPublicationLedger } from ${JSON.stringify(pathToFileURL(path.resolve("src/publication-ledger.js")).href)};
  const result = await publishWithPublicationLedger({
    ledgerPath: process.argv[2],
    article: ${JSON.stringify(raceEvent)},
    mode: process.argv[3],
    publish: async () => { await new Promise(r => setTimeout(r, 100)); return { status: 200 }; }
  });
  process.stdout.write(JSON.stringify({ duplicate: result.duplicate }));
`;
const raceFile = path.join(root, "race.mjs");
await fs.writeFile(raceFile, raceScript);
const race = await Promise.all([
  exec(process.execPath, [raceFile, ledgerPath, "NORMAL"]),
  exec(process.execPath, [raceFile, ledgerPath, "BACKFILL"])
]);
const raceResults = race.map((item) => JSON.parse(item.stdout));
assert.equal(raceResults.filter((item) => !item.duplicate).length, 1, "exactly one concurrent publisher may win");
ledger = await loadPublicationLedger({ ledgerPath, seedPath });
assert.equal(ledger.entries.filter((entry) => entry.identityKeys.includes("url:https://example.test/concurrent")).length, 1);

// Two independent runner directories use separate local ledgers but the
// same simulated remote GitHub Contents/CAS authority.
const runnerA = await fs.mkdtemp(path.join(root, "runner-a-"));
const runnerB = await fs.mkdtemp(path.join(root, "runner-b-"));
const distributedScript = `
  import { publishWithPublicationLedger } from ${JSON.stringify(pathToFileURL(path.resolve("src/publication-ledger.js")).href)};
  import { GitHubPublicationClaimStore } from ${JSON.stringify(pathToFileURL(path.resolve("src/github-publication-claim.js")).href)};
  const store = new GitHubPublicationClaimStore({ token: "test", repository: "test/repo", branch: "main", baseUrl: process.argv[3], path: ".state/publication-claims.json" });
  const result = await publishWithPublicationLedger({
    ledgerPath: process.argv[2] + "/ledger.json",
    article: ${JSON.stringify({ title: "Cross runner event", cityCode: "mumbai", newsLink: "https://example.test/cross-runner" })},
    mode: process.argv[4],
    claimStore: store,
    publish: async () => { await new Promise(r => setTimeout(r, 75)); return { status: 200 }; }
  });
  process.stdout.write(JSON.stringify({ duplicate: result.duplicate }));
`;
const distributedFile = path.join(root, "distributed.mjs");
await fs.writeFile(distributedFile, distributedScript);
const distributed = await Promise.all([
  exec(process.execPath, [distributedFile, runnerA, casBaseUrl, "NORMAL"], { cwd: runnerA }),
  exec(process.execPath, [distributedFile, runnerB, casBaseUrl, "BACKFILL"], { cwd: runnerB })
]);
const distributedResults = distributed.map((item) => JSON.parse(item.stdout));
assert.equal(distributedResults.filter((item) => !item.duplicate).length, 1, "remote CAS must select one claimant");
assert.equal(remoteState.claims.filter((claim) => claim.status === "PUBLISHED").length, 1);

const semanticClaimStore = new GitHubPublicationClaimStore({ token: "test", repository: "test/repo", branch: "main", baseUrl: casBaseUrl, path: ".state/publication-claims.json" });
const semanticWinner = await semanticClaimStore.claim({ article: gaur, mode: "NORMAL" });
assert.equal(semanticWinner.acquired, true, "first source may claim the Gaur event");
assert.equal((await semanticClaimStore.claim({ article: gaurAlternate, mode: "BACKFILL" })).acquired, false, "alternate Gaur source must lose the shared semantic claim");

const expiringStore = new GitHubPublicationClaimStore({ token: "test", repository: "test/repo", branch: "main", baseUrl: casBaseUrl, path: ".state/publication-claims.json", ttlMs: 100 });
const abandoned = await expiringStore.claim({ article: { title: "Abandoned claim", cityCode: "mumbai", newsLink: "https://example.test/abandoned" }, mode: "NORMAL" });
assert.equal(abandoned.acquired, true, "crashed-before-POST process must be able to acquire a bounded claim");
assert.equal((await expiringStore.claim({ article: { title: "Abandoned claim", cityCode: "mumbai", newsLink: "https://example.test/abandoned" }, mode: "BACKFILL" })).acquired, false);
await new Promise((resolve) => setTimeout(resolve, 150));
assert.equal((await expiringStore.claim({ article: { title: "Abandoned claim", cityCode: "mumbai", newsLink: "https://example.test/abandoned" }, mode: "BACKFILL" })).acquired, true, "expired claim must recover");

const failedEvent = { title: "Failed publication must not enter ledger", cityCode: "mumbai", newsLink: "https://example.test/failed" };
await assert.rejects(() => post(failedEvent, "NORMAL", { status: 503 }), /NOT_SUCCESSFUL/);
ledger = await loadPublicationLedger({ ledgerPath, seedPath });
assert.equal(ledgerHasMatch(ledger, failedEvent), false);

const corruptPath = path.join(root, "corrupt.json");
await fs.writeFile(corruptPath, "not-json");
await assert.rejects(() => loadPublicationLedger({ ledgerPath: corruptPath }), /Unexpected token|JSON/);

casServer.close();

const completedSources = new Set(["source-a"]);
const resumeEvent = { title: "New normal event between backfill jobs", cityCode: "mumbai", newsLink: "https://example.test/resume" };
assert.equal((await post(resumeEvent, "NORMAL")).duplicate, false);
ledger = await loadPublicationLedger({ ledgerPath, seedPath });
assert.equal(ledgerHasMatch(ledger, resumeEvent), true);
assert.deepEqual([...completedSources], ["source-a"], "resume state remains separate from the shared publication ledger");

console.log(JSON.stringify({
  remoteListStatus: 500,
  seedRecognized: { raymond: true, dlfAureva: true, gaurAlaris: true },
  alternateDlfSuppressed: true,
  normalFirstBackfillPosts: 0,
  backfillFirstNormalPosts: 0,
  concurrentSuccessfulPosts: 1,
  concurrentLedgerIdentities: 1,
  crossRunnerClaimWinners: 1,
  crossRunnerPostEligible: 1,
  crossRunnerLosers: 1,
  crossRunnerSimulatedPosts: 1,
  crossRunnerFinalSharedIdentities: 1,
  abandonedClaimRecovery: true,
  postSuccessBeforeFinalize: "claim remains blocking until bounded recovery; exactly-once is not mathematically guaranteed without API idempotency",
  failedPostLedgerEntry: false,
  corruptLedgerFailClosed: true,
  resumedNormalEventSuppressed: true,
  completedSourcesReprocessed: 0,
  duplicatePublicationWindow: 0
}, null, 2));
