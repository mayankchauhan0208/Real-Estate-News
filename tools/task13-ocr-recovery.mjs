import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchDocument } from './document-pipeline.mjs';
import { canonicalUrl } from './document-pipeline.mjs';
import { OCR_LIMITS, availableOcrTools, ocrCacheKey, ocrEligibility, pdfHash, runOcrFallback, validateOcrText } from './ocr-fallback.mjs';

const execFileAsync = promisify(execFile); const root = process.cwd(); const outDir = path.join(root, 'reports/source-audits/task13'); await fs.mkdir(outDir, { recursive: true });
const task12 = JSON.parse(await fs.readFile(path.join(root, 'reports/source-audits/task12/task12-document-recovery-report.json'), 'utf8'));
const targets = task12.sources.HSVP.documents.filter((item) => item.telemetry.validation === 'VALID_PDF');
const fourth = task12.sources.HSVP.documents.find((item) => item.telemetry.failureReason === 'response-size-limit');

async function inspectPdf(item) {
  const fetched = await fetchDocument(item.documentUrl, { timeoutMs: 8000, maxBytes: 4 * 1024 * 1024 }); const result = { documentUrl: canonicalUrl(item.documentUrl), bytes: fetched.telemetry.bytes, fetch: fetched.telemetry, pages: 0, render: { status: 'NOT_RUN', elapsedMs: 0, bytes: 0 }, eligibility: '', ocr: {}, quality: {}, cacheKey: '' };
  if (fetched.telemetry.validation !== 'VALID_PDF') { result.eligibility = fetched.telemetry.validation === 'TIMEOUT' ? 'OCR_UNSUPPORTED' : 'OCR_UNSUPPORTED'; result.ocr = { status: 'OCR_NOT_ATTEMPTED', reason: fetched.telemetry.failureReason || fetched.telemetry.validation }; return result; }
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'brokket-task13-')); const pdfPath = path.join(tempBase, 'document.pdf'); await fs.writeFile(pdfPath, fetched.body); const tools = availableOcrTools();
  try {
    if (tools.pdfinfo) { try { const info = await execFileAsync(tools.pdfinfo, [pdfPath], { timeout: 4000, windowsHide: true }); result.pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1] || 0); } catch { result.pages = 0; } }
    result.eligibility = ocrEligibility({ trustedSource: true, discoveredFromListing: true, pdfValidation: 'VALID_PDF', normalTextUsable: false, bytes: fetched.body.length, pages: result.pages });
    if (tools.pdftoppm && result.eligibility === 'OCR_ELIGIBLE') { const imagePath = path.join(tempBase, 'page'); const started = Date.now(); try { await execFileAsync(tools.pdftoppm, ['-f', '1', '-l', String(Math.min(result.pages || 1, OCR_LIMITS.maxPages)), '-singlefile', '-r', '120', '-png', pdfPath, imagePath], { timeout: 5000, windowsHide: true }); const pngPath = `${imagePath}.png`; const stat = await fs.stat(pngPath); result.render = { status: 'RENDERED', elapsedMs: Date.now() - started, bytes: stat.size }; } catch (error) { result.render = { status: /timed out|timeout/i.test(error.message) ? 'OCR_TIMEOUT' : 'RENDER_FAILED', elapsedMs: Date.now() - started, bytes: 0, error: error.message }; } }
    result.ocr = result.eligibility === 'OCR_ELIGIBLE' ? runOcrFallback() : { status: result.eligibility, reason: 'Eligibility gate did not permit OCR.' };
    result.quality = validateOcrText(''); result.cacheKey = ocrCacheKey({ canonicalDocumentUrl: result.documentUrl, contentHash: pdfHash(fetched.body), engine: result.ocr.tools?.tesseract || 'none', language: 'eng+hin' });
  } finally { await fs.rm(tempBase, { recursive: true, force: true }); }
  return result;
}

const documents = []; for (const item of targets) documents.push(await inspectPdf(item));
const cacheKeys = documents.map((item) => item.cacheKey); const duplicateCacheOperations = cacheKeys.length - new Set(cacheKeys).size;
const tools = availableOcrTools(); const ocrProbe = runOcrFallback();
const report = { generatedAt: new Date().toISOString(), baseline: { cities: 234, runtimeUrls: 571, duplicateSourceRows: 0, positiveControls: 8, automaticValidRecords: 0, negativeProtection: '8/8' }, engineEvaluation: { localTools: tools, selectedApproach: 'bounded local OCR fallback gate; execution remains disabled until a local OCR engine/language pack is available', status: ocrProbe.status, compatibility: tools.tesseract ? 'PRODUCTION_COMPATIBLE_WITH_CHANGES' : 'NOT_PRODUCTION_PRACTICAL', english: 'UNVERIFIED', hindi: 'UNVERIFIED', cloudDependency: false }, limits: OCR_LIMITS, hsvp: { pdfsAttempted: documents.length, pdfs: documents, ocrEligible: documents.filter((item) => item.eligibility === 'OCR_ELIGIBLE').length, ocrUsable: documents.filter((item) => ['OCR_USABLE', 'OCR_HIGH_CONFIDENCE'].includes(item.quality.status)).length, validRecords: 0, automaticallyRecoveredValidRecords: 0 }, fourthDocument: fourth ? { documentUrl: fourth.documentUrl, result: 'OCR_TOO_LARGE', reason: 'Retained global 4 MB limit; no global increase made. A source-specific streaming ceiling remains future work.' } : { result: 'NOT_FOUND' }, metadataFusion: { listingMetadataPreserved: true, ocrMetadata: false, inventedFields: 0, provenance: ['LISTING_METADATA', 'PDF_METADATA', 'OCR_TEXT'] }, cache: { keysGenerated: documents.length, duplicateCacheOperations, contentHashDedupe: duplicateCacheOperations === 0 ? 'no duplicates in HSVP set' : 'duplicate content detected' }, automaticRecovery: { before: 0, after: 0, classifierFalseNegatives: [], geoFalseNegatives: [] }, performance: { renderablePages: documents.filter((item) => item.render.status === 'RENDERED').length, totalRenderMs: documents.reduce((sum, item) => sum + (item.render.elapsedMs || 0), 0), ocrMsPerPage: 'UNVERIFIED_NO_ENGINE', ocrMsPerDocument: 'UNVERIFIED_NO_ENGINE', failureIsolation: true }, nextBottleneck: 'OCR_ENGINE_AVAILABILITY_AND_SCANNED_TEXT_QUALITY' };
await fs.writeFile(path.join(outDir, 'task13-ocr-recovery-report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ engine: report.engineEvaluation, hsvp: { attempted: report.hsvp.pdfsAttempted, eligible: report.hsvp.ocrEligible, usable: report.hsvp.ocrUsable, valid: report.hsvp.validRecords }, fourthDocument: report.fourthDocument, cache: report.cache }, null, 2));
