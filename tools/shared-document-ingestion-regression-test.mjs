import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { ingestDocumentEvidence, officialDocumentOcrOptions } from "../src/document-ingestion.js";
import { extractLinkedDocumentUrl, toApiPayload } from "../src/index.js";
import { identityFor } from "../src/publication-ledger.js";

const sourceUrl = "https://up-rera.in/PressRelease";
const documentUrl = "https://up-rera.in/documents/project-approval.pdf";
const extractedText = "UP RERA approves registration of a named residential project in Noida with 420 homes on 12 acres. ".repeat(4);
const calls = [];
const fetchDocumentImpl = async (url, limits, options) => {
  calls.push({ url, limits, options });
  return {
    body: Buffer.from("%PDF-shared-production-control"),
    text: extractedText,
    telemetry: {
      validation: "VALID_PDF",
      extractionMethod: "BOUNDED_OCR",
      ocr: { status: "OCR_HIGH_CONFIDENCE", languages: ["eng", "hin"] },
      failureReason: ""
    }
  };
};

const run = (runMode) => ingestDocumentEvidence({
  documentUrl,
  sourceUrl,
  timeoutMs: 90000,
  fetchDocumentImpl,
  renderDocumentThumbnailImpl: async () => ({
    rendered: true,
    cached: true,
    page: 1,
    format: "JPEG",
    thumbnailUrl: "https://raw.githubusercontent.com/example/repo/main/admin/document-thumbnails/control-p1.jpg",
    error: ""
  }),
  runMode
});

const normal = await run("NORMAL_CURRENT");
const backfill = await run("BACKFILL");
assert.deepEqual(normal, backfill, "normal and backfill must use identical document evidence semantics");
assert.equal(normal.fullArticleRead, true);
assert.equal(normal.officialDocumentRead, true);
assert.equal(normal.extractionMethod, "BOUNDED_OCR");
assert.equal(normal.directDocumentVerified, true);
assert.equal(normal.documentUrl, documentUrl);
assert.equal(normal.thumbnail.rendered, true);
assert.equal(calls.length, 2);
assert.deepEqual(calls[0], calls[1], "mode must not alter PDF/OCR acquisition options");
assert.deepEqual(calls[0].options.ocr, officialDocumentOcrOptions({ sourceUrl, documentUrl }));
assert.deepEqual(calls[0].options.ocr.languages, ["eng", "hin", "mar", "guj", "kan", "tel", "tam", "mal", "ben"]);

const detailPage = cheerio.load('<main><a href="/images/plan.jpg">Plan image</a><a href="/documents/project-approval.pdf">View approval</a></main>');
assert.equal(
  extractLinkedDocumentUrl(detailPage, "https://up-rera.in/releases/project-approval"),
  "https://up-rera.in/documents/project-approval.pdf",
  "authority detail pages must follow their linked PDF instead of stopping at HTML"
);

const article = {
  title: "UP RERA approves named residential project in Noida",
  description: extractedText,
  articleText: normal.text,
  cityCode: "noida",
  newsLink: documentUrl,
  sourceUrl: documentUrl,
  thumbnailImage: normal.thumbnail.thumbnailUrl,
  postedBy: "UP RERA",
  postedByLogo: "https://up-rera.in/favicon.ico",
  publishedAt: "2026-10-07T00:00:00.000Z",
  fullArticleRead: normal.fullArticleRead,
  officialDocumentRead: normal.officialDocumentRead
};
const payload = toApiPayload(article);
assert.equal(payload.newsLink, documentUrl, "publication source URL must be the verified direct document");
assert.equal(payload.thumbnailImage, normal.thumbnail.thumbnailUrl, "publication thumbnail must come from the PDF render");
assert.equal(payload.postedBy, "UP RERA", "publication source name must be the issuing authority");
const normalIdentity = identityFor(article);
const backfillIdentity = identityFor({ ...article, runMode: "BACKFILL" });
assert.deepEqual(
  {
    canonicalUrl: normalIdentity.canonicalUrl,
    canonicalEventCity: normalIdentity.canonicalEventCity,
    publicationDate: normalIdentity.publicationDate,
    identityKeys: normalIdentity.identityKeys,
    semanticIdentity: normalIdentity.semanticIdentity
  },
  {
    canonicalUrl: backfillIdentity.canonicalUrl,
    canonicalEventCity: backfillIdentity.canonicalEventCity,
    publicationDate: backfillIdentity.publicationDate,
    identityKeys: backfillIdentity.identityKeys,
    semanticIdentity: backfillIdentity.semanticIdentity
  },
  "publication identity must remain mode-independent"
);

console.log("Shared RERA/PDF ingestion parity passed: NORMAL_CURRENT and BACKFILL use identical extraction, OCR, and identity semantics.");
