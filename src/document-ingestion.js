import { extractDocumentBody, fetchDocument } from "../tools/document-pipeline.mjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { availableOcrTools } from "../tools/ocr-fallback.mjs";

const execFileAsync = promisify(execFile);
const DOCUMENT_THUMBNAIL_DIR = path.resolve("admin", "document-thumbnails");

function documentThumbnailUrl(fileName, publicBaseUrl = "") {
  const base = publicBaseUrl || (process.env.GITHUB_REPOSITORY
    ? `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/${process.env.DOCUMENT_THUMBNAIL_REF || "main"}/admin/document-thumbnails`
    : "");
  return base ? `${base.replace(/\/$/, "")}/${fileName}` : "";
}

export async function renderDocumentThumbnail(body, {
  documentUrl = "",
  publicBaseUrl = "",
  outputDir = DOCUMENT_THUMBNAIL_DIR,
  page = 1,
  timeoutMs = 10000
} = {}) {
  const tools = availableOcrTools();
  if (!Buffer.isBuffer(body) || body.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return { rendered: false, error: "INVALID_PDF", page };
  }
  if (!tools.pdftoppm) return { rendered: false, error: "PDF_RENDERER_UNAVAILABLE", page };

  const digest = crypto.createHash("sha256").update(body).digest("hex").slice(0, 24);
  const fileName = `${digest}-p${page}.jpg`;
  const outputPath = path.join(outputDir, fileName);
  await fs.mkdir(outputDir, { recursive: true });
  try {
    await fs.access(outputPath);
  } catch {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "brokket-pdf-thumbnail-"));
    const pdfPath = path.join(tempDir, "document.pdf");
    const imageBase = path.join(tempDir, "thumbnail");
    try {
      await fs.writeFile(pdfPath, body);
      await execFileAsync(tools.pdftoppm, [
        "-f", String(page), "-l", String(page), "-singlefile", "-jpeg",
        "-scale-to-x", "640", "-scale-to-y", "360", pdfPath, imageBase
      ], { timeout: timeoutMs, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      await fs.copyFile(`${imageBase}.jpg`, outputPath);
    } catch (error) {
      return { rendered: false, error: error.message || "PDF_RENDER_FAILED", page, documentUrl };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  const thumbnailUrl = documentThumbnailUrl(fileName, publicBaseUrl);
  return {
    rendered: Boolean(thumbnailUrl),
    cached: true,
    page,
    format: "JPEG",
    width: 640,
    height: 360,
    outputPath,
    thumbnailUrl,
    error: thumbnailUrl ? "" : "PUBLIC_THUMBNAIL_BASE_UNAVAILABLE"
  };
}

export const OFFICIAL_DOCUMENT_OCR_LANGUAGES = Object.freeze([
  "eng", "hin", "mar", "guj", "kan", "tel", "tam", "mal", "ben"
]);

export function isTrustedOfficialDocumentSource(...values) {
  return values.some((value) => {
    try {
      const host = new URL(String(value || "")).hostname.replace(/^www\./, "").toLowerCase();
      return host.endsWith(".gov.in") || host.endsWith(".nic.in") ||
        /(?:^|\.)(?:up-rera|haryanarera|hareraggm|gujrera|jharera|maharera|rera)(?:\.|$)/i.test(host) ||
        /(?:rera|hsvp|mhada|cidco|dda|idaindore)/i.test(host);
    } catch {
      return false;
    }
  });
}

export function officialDocumentOcrOptions({ sourceUrl = "", documentUrl = "" } = {}) {
  const trustedSource = isTrustedOfficialDocumentSource(sourceUrl, documentUrl);
  return {
    trustedSource,
    discoveredFromListing: trustedSource,
    languages: [...OFFICIAL_DOCUMENT_OCR_LANGUAGES],
    maxPages: 3,
    documentTimeoutMs: 15000
  };
}

export async function ingestDocumentEvidence({
  documentUrl = "",
  sourceUrl = "",
  body = null,
  contentType = "application/pdf",
  status = 200,
  directResponseUrlVerified = false,
  timeoutMs = 20000,
  maxBytes = 4 * 1024 * 1024,
  signal = undefined,
  fetchDocumentImpl = fetchDocument,
  extractDocumentBodyImpl = extractDocumentBody,
  renderDocumentThumbnailImpl = renderDocumentThumbnail
} = {}) {
  const ocr = officialDocumentOcrOptions({ sourceUrl, documentUrl });
  const result = body == null
    ? await fetchDocumentImpl(documentUrl, { timeoutMs, maxBytes }, { ocr, signal })
    : await extractDocumentBodyImpl(body, { contentType, status, ocr });
  const readable = result.telemetry.validation === "VALID_PDF" && String(result.text || "").trim().length >= 200;
  const directDocumentUrl = result.telemetry.finalUrl || documentUrl;
  const directDocumentVerified = result.telemetry.validation === "VALID_PDF" && (body == null || directResponseUrlVerified);
  const thumbnail = result.telemetry.validation === "VALID_PDF"
    ? await renderDocumentThumbnailImpl(result.body, { documentUrl: directDocumentUrl })
    : { rendered: false, error: result.telemetry.validation || "INVALID_PDF", page: 1 };
  return {
    text: readable ? String(result.text).trim() : "",
    body: result.body,
    readable,
    officialDocumentRead: readable && ocr.trustedSource,
    articleReadAttempted: true,
    fullArticleRead: readable,
    extractionMethod: result.telemetry.extractionMethod || "PDF_TEXT",
    ocr: result.telemetry.ocr || null,
    articleReadError: readable ? "" : result.telemetry.failureReason || result.telemetry.textExtraction || "document was not readable",
    documentUrl: directDocumentUrl,
    directDocumentVerified,
    thumbnail,
    documentTelemetry: result.telemetry
  };
}
