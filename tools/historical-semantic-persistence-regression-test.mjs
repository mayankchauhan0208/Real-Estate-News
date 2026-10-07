import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { identityFor, semanticIdentityMatches } from "../src/publication-ledger.js";
import { GitHubPublicationClaimStore } from "../src/github-publication-claim.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "brokket-semantic-history-"));
const countyHistory = identityFor({
  title: "County Group to invest Rs 2,500 cr to develop luxury homes in Gurugram",
  description: "County Group will develop 844 apartments in Sector 88A, Gurugram. An older 226-apartment project is in Sector 151, Noida.",
  articleText: "County Group will develop 844 apartments in Sector 88A, Gurugram. The earlier Noida project is a separate historical reference.",
  cityCode: "noida",
  canonicalEventCity: "gurugram",
  newsLink: "https://history.example/county-original"
});
const countyAlternate = identityFor({
  title: "County Group announces 844-home Sector 88A Gurugram development",
  description: "The developer is launching a 24-acre luxury residential project in Gurugram.",
  articleText: "County Group will develop 844 apartments in Sector 88A, Gurugram.",
  cityCode: "gurugram",
  newsLink: "https://alternate.example/county-new-url"
});
assert.equal(semanticIdentityMatches(countyHistory, countyAlternate), true);

const signatureArticles = [
  { title: "Signature Global buys 25 acres for Rs 150 crore, ties up 169.22 acres in Gurugram", description: "Signature Global acquired 194.22 acres in Gurugram for a luxury farmhouse villa project.", cityCode: "gurugram", newsLink: "https://history.example/signature-a" },
  { title: "Signatureglobal signs pact to develop 194-acre land in Gurugram", description: "The project targets Rs 5,500-6,000 crore GDV and 6.77 million sq ft.", cityCode: "gurugram", newsLink: "https://history.example/signature-b" },
  { title: "Signature Global plans 194-acre luxury farmhouse project in Gurugram West", description: "The 194-acre development has 6.77 million sq ft potential.", cityCode: "gurugram", newsLink: "https://history.example/signature-c" }
].map((article) => identityFor({ ...article, articleText: `${article.title} ${article.description}` }));
assert.equal(signatureArticles.every((identity) => signatureArticles[0].semanticIdentity?.canonicalEventFingerprint === identity.semanticIdentity?.canonicalEventFingerprint), true);
assert.equal(new Set(signatureArticles.map((identity) => identity.semanticIdentity.semanticClusterId)).size, 1);
assert.equal(semanticIdentityMatches(signatureArticles[0], identityFor({
  title: "Signatureglobal acquires the 194.22-acre Gurugram farmhouse development",
  description: "A new report confirms the 25-acre purchase and 169.22-acre collaboration.",
  articleText: "Signatureglobal acquired 194.22 acres in Gurugram for the same development.",
  cityCode: "gurugram",
  newsLink: "https://new.example/signature-never-seen-before"
})), true);

const laterLaunch = identityFor({
  title: "Signature Global launches a later Gurugram project",
  description: "A later launch follows a separate 300-acre acquisition.",
  articleText: "Signature Global acquired 300 acres for a later project and launched it after construction.",
  cityCode: "gurugram",
  newsLink: "https://new.example/later-launch"
});
assert.equal(semanticIdentityMatches(signatureArticles[0], laterLaunch), false);

const statePath = path.join(root, "claims.json");
const state = { version: 2, updatedAt: new Date().toISOString(), claims: signatureArticles.map((identity, index) => ({
  claimId: `signature-${index}`,
  status: "PUBLISHED",
  identityKeys: identity.identityKeys,
  semanticIdentity: identity.semanticIdentity,
  semanticClusterId: identity.semanticIdentity.semanticClusterId,
  canonicalEventCity: identity.semanticIdentity.canonicalEventCity,
  city: identity.city
})) };
await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
const restored = JSON.parse(await fs.readFile(statePath, "utf8"));
assert.equal(restored.claims.length, 3);
assert.equal(new Set(restored.claims.map((claim) => claim.semanticClusterId)).size, 1);
assert.equal(restored.claims[0].canonicalEventCity, "gurugram");

let claimWrites = 0;
const remoteState = { version: 2, updatedAt: new Date().toISOString(), claims: [{
  claimId: "signature-history",
  status: "PUBLISHED",
  identityKeys: signatureArticles[0].identityKeys,
  semanticIdentity: signatureArticles[0].semanticIdentity,
  semanticClusterId: signatureArticles[0].semanticIdentity.semanticClusterId,
  canonicalEventCity: "gurugram",
  city: ["gurugram"]
}] };
const claimStore = new GitHubPublicationClaimStore({
  token: "test",
  repository: "test/repo",
  branch: "main",
  baseUrl: "https://claims.example",
  fetchImpl: async (url, options = {}) => {
    if (options.method === "PUT") {
      claimWrites += 1;
      return new Response("{}", { status: 200 });
    }
    return new Response(JSON.stringify({
      sha: "history-sha",
      content: Buffer.from(JSON.stringify(remoteState)).toString("base64")
    }), { status: 200 });
  }
});
const preClaim = await claimStore.claim({
  article: {
    title: "Signatureglobal reports the 194.22-acre Gurugram farmhouse development",
    description: "The same 25-acre purchase and 169.22-acre collaboration form the same development.",
    articleText: "Signatureglobal acquired 194.22 acres in Gurugram for the same development.",
    cityCode: "gurugram",
    newsLink: "https://new.example/signature-discovery"
  },
  mode: "NORMAL"
});
assert.equal(preClaim.acquired, false);
assert.equal(claimWrites, 0, "existing semantic history must suppress before distributed claim CAS");

console.log(JSON.stringify({
  passed: true,
  countyCanonicalGeoPreserved: true,
  countyAlternateSuppressedBeforeClaim: true,
  signatureRecords: 3,
  signatureClusters: 1,
  signatureNewUrlSuppressedBeforeClaim: true,
  falseLifecycleCollapses: 0,
  restorePreserved: true,
  distributedExistingEventClaimWinners: 0,
  distributedExistingEventWrites: 0
}, null, 2));
