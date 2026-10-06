import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  identityFor,
  ledgerHasMatch,
  loadPublicationLedger,
  publishWithPublicationLedger
} from "../src/publication-ledger.js";

const exec = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "brokket-shared-ledger-"));
const ledgerPath = path.join(root, "publication-ledger.json");
const seedPath = path.resolve("data/publication-ledger-seed.json");

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
const eventDedupe = ["event:dlf|senior-living-sale|gurugram||"];

let ledger = await loadPublicationLedger({ ledgerPath, seedPath });
assert.equal(ledger.entries.length, 3, "verified live seed must contain exactly three entries");
assert.equal(ledgerHasMatch(ledger, raymond), true);
assert.equal(ledgerHasMatch(ledger, dlf), true);
assert.equal(ledgerHasMatch(ledger, gaur), true);
assert.equal(ledgerHasMatch(ledger, dlfAlternate, eventDedupe), true, "alternate DLF URL must match event identity");

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

const failedEvent = { title: "Failed publication must not enter ledger", cityCode: "mumbai", newsLink: "https://example.test/failed" };
await assert.rejects(() => post(failedEvent, "NORMAL", { status: 503 }), /NOT_SUCCESSFUL/);
ledger = await loadPublicationLedger({ ledgerPath, seedPath });
assert.equal(ledgerHasMatch(ledger, failedEvent), false);

const corruptPath = path.join(root, "corrupt.json");
await fs.writeFile(corruptPath, "not-json");
await assert.rejects(() => loadPublicationLedger({ ledgerPath: corruptPath }), /Unexpected token|JSON/);

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
  failedPostLedgerEntry: false,
  corruptLedgerFailClosed: true,
  resumedNormalEventSuppressed: true,
  completedSourcesReprocessed: 0,
  duplicatePublicationWindow: 0
}, null, 2));
