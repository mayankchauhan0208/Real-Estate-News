import fs from "node:fs/promises";
import path from "node:path";
import { canonicalEventCityFor, identityFor, normalizeUrl } from "../src/publication-ledger.js";

const root = path.resolve(process.argv[2] || process.env.TASK41_ARTIFACT_ROOT || "");
const claimsPath = path.resolve(process.argv[3] || ".state/publication-claims.json");
const outputClaimsPath = path.resolve(process.argv[4] || ".state/publication-claims-enriched.json");
const outputLedgerPath = path.resolve(process.argv[5] || ".state/publication-ledger-enriched.json");

if (!root) throw new Error("TASK41_ARTIFACT_ROOT_REQUIRED");

async function filesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(fullPath));
    else if (entry.isFile() && entry.name.startsWith("news-run-") && entry.name.endsWith(".json") && fullPath.split(/[\\/]/).includes("runs")) files.push(fullPath);
  }
  return files;
}

const reports = [];
for (const file of await filesUnder(root)) {
  const report = JSON.parse(await fs.readFile(file, "utf8"));
  if (report.posted?.length) reports.push(report);
}
const posts = reports.flatMap((report) => report.posted || []);
if (posts.length !== 19) throw new Error(`EXPECTED_19_BACKFILL_POSTS_GOT_${posts.length}`);

const claimsState = JSON.parse(await fs.readFile(claimsPath, "utf8"));
if (claimsState.version !== 1 || !Array.isArray(claimsState.claims)) throw new Error("PUBLICATION_CLAIMS_STATE_INVALID");

const enrichedByUrl = new Map();
for (const article of posts) {
  const canonicalUrl = article.trace?.canonicalUrl || article.newsLink || "";
  const identity = identityFor({
    ...article,
    canonicalUrl,
    articleText: article.articleTextExcerpt,
    originMode: "BACKFILL"
  }, article.decisionEvidence?.dedupeIds || []);
  const semantic = identity.semanticIdentity;
  enrichedByUrl.set(normalizeUrl(canonicalUrl), {
    article,
    identity,
    semantic
  });
}

let enrichedCount = 0;
let completeCount = 0;
let partialCount = 0;
let insufficientCount = 0;
const claims = claimsState.claims.map((claim) => {
  const urlKey = claim.identityKeys.find((key) => key.startsWith("url:"))?.slice(4) || "";
  const match = enrichedByUrl.get(normalizeUrl(urlKey));
  if (!match) return { ...claim };
  enrichedCount += 1;
  const { article, identity, semantic } = match;
  const enrichmentStatus = semantic ? "COMPLETE_SEMANTIC_IDENTITY" :
    (article.cityCode ? "PARTIAL_BUT_SAFE" : "INSUFFICIENT_EVIDENCE");
  if (enrichmentStatus === "COMPLETE_SEMANTIC_IDENTITY") completeCount += 1;
  else if (enrichmentStatus === "PARTIAL_BUT_SAFE") partialCount += 1;
  else insufficientCount += 1;
  return {
    ...claim,
    publishedCity: article.cityCode || "",
    canonicalEventCity: semantic?.canonicalEventCity || canonicalEventCityFor(article),
    normalizedBuilder: semantic?.normalizedBuilder || "",
    normalizedProject: semantic?.normalizedProject || "",
    canonicalEventType: semantic?.canonicalEventType || "",
    numericAnchors: semantic?.numericAnchors || [],
    canonicalEventFingerprint: semantic?.canonicalEventFingerprint || "",
    semanticClusterId: semantic?.semanticClusterId || "",
    semanticIdentity: semantic || null,
    enrichmentStatus,
    publicationEvidence: {
      title: article.title,
      sourceUrl: article.sourceUrl || "",
      publishedAt: article.publishedAt || "",
      verifiedRun: "37564530919"
    },
    identityKeys: [...new Set([...claim.identityKeys, ...identity.identityKeys])]
  };
});

if (enrichedCount !== 19) throw new Error(`EXPECTED_19_ENRICHED_CLAIMS_GOT_${enrichedCount}`);

const enrichedClaimsState = {
  version: 2,
  updatedAt: new Date().toISOString(),
  migration: "historical-semantic-ledger-enrichment",
  claims
};
const ledgerEntries = claims.map((claim) => ({
  recordId: claim.claimId,
  identityKeys: claim.identityKeys,
  city: claim.city || [],
  publishedCity: claim.publishedCity || claim.city?.[0] || "",
  canonicalEventCity: claim.canonicalEventCity || claim.city?.[0] || "",
  semanticIdentity: claim.semanticIdentity || null,
  canonicalEventFingerprint: claim.canonicalEventFingerprint || "",
  semanticClusterId: claim.semanticClusterId || "",
  originMode: claim.originMode || "NORMAL",
  publicationDate: claim.publicationEvidence?.publishedAt || "",
  postedAt: claim.finalizedAt || claim.claimedAt || ""
}));
const ledger = {
  version: 2,
  updatedAt: enrichedClaimsState.updatedAt,
  entries: ledgerEntries
};

await fs.mkdir(path.dirname(outputClaimsPath), { recursive: true });
await fs.writeFile(outputClaimsPath, `${JSON.stringify(enrichedClaimsState, null, 2)}\n`);
await fs.writeFile(outputLedgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

const clusters = new Map();
for (const claim of claims) {
  if (claim.semanticClusterId) {
    const group = clusters.get(claim.semanticClusterId) || [];
    group.push(claim.claimId);
    clusters.set(claim.semanticClusterId, group);
  }
}
console.log(JSON.stringify({
  all19BackfillPostsFound: posts.length === 19,
  enrichedClaims: enrichedCount,
  completeSemanticIdentities: completeCount,
  partialButSafeIdentities: partialCount,
  insufficientEvidence: insufficientCount,
  outputClaimsPath,
  outputLedgerPath,
  semanticClusters: [...clusters.values()].map((claimIds) => ({ claimIds, size: claimIds.length }))
}, null, 2));
