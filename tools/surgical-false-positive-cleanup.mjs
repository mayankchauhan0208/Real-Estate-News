import fs from "node:fs/promises";
import path from "node:path";
import { getArticleFinalState, getRejectionReasons, normalizeArticleUrlForDedupe } from "../src/index.js";
import { GitHubPublicationClaimStore } from "../src/github-publication-claim.js";

const execute = String(process.env.EXECUTE_CLEANUP || "false").toLowerCase() === "true";
const listUrl = process.env.APP_LIST_API_URL || "https://www.brokket.app/api/more-pages/news/list";
const apiUrl = process.env.APP_API_URL || "https://www.brokket.app/api/more-pages/news";
const apiKey = process.env.APP_LIST_API_KEY || process.env.APP_API_KEY || "";
const outputDir = path.resolve("reports/source-audits/surgical-cleanup");
const targets = [
  {
    claimId: "f97b930c-d120-4874-b9b2-4d430c401e48",
    articleId: "6ac75b7bb027ce51c9a777d4",
    title: "राँची में 23 अगस्त को झारखंड रेरा सेमिनार, हितधारकों को अधिनियम की बारीकियों पर मिलेगा मार्गदर्शन",
    city: "ranchi",
    sourceUrl: "https://hindi.news24online.com/gov-news/jharkhand-rera-seminar-ranchi-real-estate/1739397/",
    description: "झारखंड रेरा 23 अगस्त 2026 को रांची में रियल एस्टेट कानून और नियमों को लेकर सेमिनार आयोजित करेगा. इसमें बिल्डर, होमबायर्स और अन्य हितधारकों को जानकारी दी जाएगी.",
    rejectionReason: "ROUTINE_RERA_SEMINAR_EVENT"
  },
  {
    claimId: "277f8837-abb2-4387-8285-78c00431df8b",
    articleId: "6ac75b86b027ce51c9a777d6",
    title: "CMC Joins Hands with T-Works to Develop Tech Solutions for Urban Challenges",
    city: "hyderabad",
    sourceUrl: "https://proppuls.in/cmc-joins-hands-with-t-works-to-develop-tech-solutions-for-urban-challenges",
    description: "The partnership will take civic problems from prototype development to real-world testing, with successful solutions considered for wider deployment across Cyberabad.",
    rejectionReason: "URBAN_TECH_COLLABORATION_WITHOUT_PROPERTY_EVENT"
  }
];

function normalizedTitle(value) {
  return String(value || "").normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-IN");
}

function headers() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}`, ACCESS_TOKEN: apiKey } : {})
  };
}

async function listAll() {
  const items = [];
  for (let page = 0; page < 100; page += 1) {
    const response = await fetch(listUrl, { method: "POST", headers: headers(), body: JSON.stringify({ page, size: 1000 }) });
    if (!response.ok) throw new Error(`LIST_HTTP_${response.status}`);
    const payload = await response.json();
    const pageData = payload?.data?.page || payload?.data || payload;
    const content = Array.isArray(pageData?.content) ? pageData.content : [];
    items.push(...content);
    if (!content.length || (Number(pageData.totalPages || 0) && page + 1 >= Number(pageData.totalPages))) break;
  }
  return items;
}

function exactMatches(items, target) {
  const url = normalizeArticleUrlForDedupe(target.sourceUrl);
  const title = normalizedTitle(target.title);
  return items.filter((item) =>
    normalizeArticleUrlForDedupe(item.newsLink || "") === url &&
    normalizedTitle(item.title) === title &&
    String(item.cityCode || "").trim().toLowerCase() === target.city
  );
}

function rejectionState(record) {
  const article = { ...record, articleText: record.articleText || record.description || "", fullArticleRead: true, articleReadAttempted: true };
  const reasons = getRejectionReasons(article, new Set());
  return { finalState: getArticleFinalState(article, reasons), reasons };
}

async function deactivate(record) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/${encodeURIComponent(record.id)}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      title: record.title,
      description: record.description,
      isActive: false,
      newsLink: record.newsLink || null,
      thumbnailImage: record.thumbnailImage || null,
      postedBy: record.postedBy || null,
      postedByLogo: record.postedByLogo || null,
      cityCode: record.cityCode || null
    })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`DEACTIVATE_HTTP_${response.status}:${body.slice(0, 200)}`);
  return { status: response.status, body: body.slice(0, 500) };
}

let before = [];
let listError = "";
try {
  before = await listAll();
} catch (error) {
  listError = String(error?.message || error);
}
const store = new GitHubPublicationClaimStore({
  token: process.env.GITHUB_TOKEN,
  repository: process.env.GITHUB_REPOSITORY,
  branch: process.env.GITHUB_REF_NAME || "main",
  path: process.env.PUBLICATION_CLAIM_PATH || ".state/publication-claims.json"
});
const results = [];
for (const target of targets) {
  const matches = before.length ? exactMatches(before, target) : [{
    id: target.articleId,
    title: target.title,
    description: target.description,
    cityCode: target.city,
    newsLink: target.sourceUrl,
    isActive: true
  }];
  const classification = matches.length === 1 ? rejectionState(matches[0]) : null;
  const result = { ...target, exactMatchCount: matches.length, articleId: matches[0]?.id || "", classification, tombstone: false, deactivateAttempted: false };
  if (execute && matches.length === 1 && classification?.finalState?.startsWith("REJECTED")) {
    await store.tombstone(target.claimId, {
      rejectionReason: target.rejectionReason,
      deletedProductionArticleId: matches[0].id,
      classificationVersion: process.env.CLASSIFICATION_VERSION || "surgical-cleanup-v1",
      title: target.title,
      sourceUrl: target.sourceUrl,
      city: target.city
    });
    result.tombstone = true;
    result.deactivateAttempted = true;
    result.deactivate = await deactivate(matches[0]);
  }
  results.push(result);
}

let after = before;
if (execute && !listError) after = await listAll();
for (const result of results) {
  const target = targets.find((item) => item.claimId === result.claimId);
  const matches = after.length ? exactMatches(after, target) : [];
  let responseRecord = null;
  try { responseRecord = JSON.parse(result.deactivate?.body || "")?.data || null; } catch {}
  result.activeMatchesAfter = after.length
    ? matches.filter((item) => item.isActive === true).length
    : responseRecord?.id === target.articleId && responseRecord?.isActive === false ? 0 : null;
  result.recordMatchesAfter = after.length ? matches.length : null;
  result.publicRecordPresentAfter = result.activeMatchesAfter === null ? null : result.activeMatchesAfter > 0;
  result.verification = after.length ? "AUTHENTICATED_LIST" : "EXACT_UPDATE_RESPONSE";
}
const report = { generatedAt: new Date().toISOString(), execute, listUrl, apiUrl, listError, idEvidence: "AUTHORITATIVE_PRODUCTION_CREATE_RESPONSE_RUN_37753324192", recordsBefore: before.length, recordsAfter: after.length, results };
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "surgical-cleanup-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (results.some((item) => item.exactMatchCount !== 1 || !item.classification?.finalState?.startsWith("REJECTED") || (execute && (!item.tombstone || item.publicRecordPresentAfter !== false)))) process.exitCode = 1;
