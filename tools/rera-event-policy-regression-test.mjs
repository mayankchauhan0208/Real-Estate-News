import assert from "node:assert/strict";
import { classifyOfficialReraEvent, getRejectionReasons, isPublishableArticle } from "../src/index.js";

const base = {
  sourceUrl: "https://up-rera.in/documents/ViewDocument?id=12",
  listingUrl: "https://up-rera.in/PressRelease",
  documentUrl: "https://up-rera.in/documents/ViewDocument?id=12",
  newsLink: "https://up-rera.in/documents/ViewDocument?id=12",
  cityCode: "lucknow",
  sourceCityCodes: ["lucknow"],
  publishedAt: "2026-10-07T00:00:00.000Z",
  createdAt: "2026-10-07T00:00:00.000Z",
  fullArticleRead: true,
  articleReadAttempted: true,
  officialDocumentRead: true,
  directDocumentVerified: true,
  authoritativeContent: true,
  thumbnailImage: "https://raw.githubusercontent.com/example/repo/main/admin/document-thumbnails/test.jpg",
  postedBy: "UP RERA",
  postedByLogo: "https://up-rera.in/favicon.ico",
  isActive: true
};

const approval = {
  ...base,
  title: "UP RERA approves 12 real estate projects in six districts",
  description: "The authority approved registration of 12 housing and commercial projects.",
  articleText: "UP RERA approved registration of 12 named real estate projects, including a residential housing project in Lucknow with project and promoter details."
};
assert.equal(classifyOfficialReraEvent(approval), "MEANINGFUL_PROPERTY_EVENT");
assert.deepEqual(getRejectionReasons(approval, new Set()), [], "meaningful UP RERA project approvals must be publishable");

const qpr = {
  ...base,
  title: "UP RERA issues QPR digital certificate submission order",
  description: "Architects, engineers and chartered accountants must use digital certificates.",
  articleText: "This routine compliance instruction explains quarterly progress report filing and digital certificate submission by architects, engineers and chartered accountants."
};
assert.equal(classifyOfficialReraEvent(qpr), "ROUTINE_ADMINISTRATIVE");
assert.ok(getRejectionReasons(qpr, new Set()).some((reason) => reason.includes("filter 19")), "QPR procedural order must be rejected from the normal feed");

const adverse = {
  ...base,
  title: "UP RERA orders recovery and penalties against promoters",
  description: "The authority began recovery proceedings and imposed penalties after complaints.",
  articleText: "UP RERA ordered recovery, penalties and enforcement action against promoters after buyer complaints and non-compliance in housing projects."
};
assert.equal(classifyOfficialReraEvent(adverse), "ADVERSE");
assert.equal(isPublishableArticle(adverse, new Set()), false, "adverse official RERA enforcement must not bypass the universal positive-content contract");

const unreadableApproval = {
  ...approval,
  fullArticleRead: false,
  officialDocumentRead: false,
  articleReadAttempted: true,
  articleText: "UP RERA approved registration of projects."
};
assert.equal(isPublishableArticle(unreadableApproval, new Set()), false, "official source metadata without a readable article or document must not publish");
assert.ok(getRejectionReasons(unreadableApproval, new Set()).some((reason) => reason.includes("FULL_ARTICLE_EXTRACTION_FAILED")), "unreadable official content must have the same evidence rejection as every other source");

console.log("RERA event policy passed: positive project approval accepted; procedural, adverse, and unreadable content rejected.");
