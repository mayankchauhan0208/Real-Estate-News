import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyDocumentResponse } from './document-pipeline.mjs';
import { ocrCacheKey, ocrEligibility, validateOcrText } from './ocr-fallback.mjs';

const root = process.cwd(); const report = JSON.parse(await fs.readFile(path.join(root, 'reports/source-audits/task13/task13-ocr-recovery-report.json'), 'utf8'));
assert.equal(report.baseline.cities, 234); assert.equal(report.baseline.runtimeUrls, 571); assert.equal(report.baseline.duplicateSourceRows, 0); assert.equal(report.baseline.negativeProtection, '8/8'); assert.equal(report.hsvp.pdfsAttempted, 3); assert.equal(report.hsvp.validRecords, 0); assert.equal(report.automaticRecovery.after, 0); assert.equal(report.performance.failureIsolation, true); assert.equal(report.cache.duplicateCacheOperations, 0);
assert.equal(classifyDocumentResponse({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.7') }), 'VALID_PDF');
assert.equal(classifyDocumentResponse({ status: 200, contentType: 'text/html', body: Buffer.from('<html>error</html>') }), 'HTML_ERROR_PAGE');
assert.equal(classifyDocumentResponse({ status: 200, contentType: 'application/pdf', body: Buffer.from('not-a-pdf') }), 'OTHER');
assert.equal(ocrEligibility({ trustedSource: true, discoveredFromListing: true, pdfValidation: 'VALID_PDF', normalTextUsable: false, bytes: 1000, pages: 1 }), 'OCR_ELIGIBLE');
assert.equal(ocrEligibility({ trustedSource: true, discoveredFromListing: true, pdfValidation: 'VALID_PDF', normalTextUsable: false, bytes: 1000, pages: 5 }), 'OCR_TOO_MANY_PAGES');
assert.equal(validateOcrText('short').status, 'OCR_EMPTY');
assert.equal(validateOcrText('The Haryana Shehri Vikas Pradhikaran housing notice concerns Faridabad flats and a dated public notice. '.repeat(8)).status, 'OCR_HIGH_CONFIDENCE');
assert.equal(ocrCacheKey({ canonicalDocumentUrl: 'https://example.test/doc.pdf', contentHash: 'abc' }), ocrCacheKey({ canonicalDocumentUrl: 'https://example.test/doc.pdf', contentHash: 'abc' }));
console.log(JSON.stringify({ passed: true, pdfsAttempted: report.hsvp.pdfsAttempted, ocrUsable: report.hsvp.ocrUsable, automaticRecovery: report.automaticRecovery.after, engineStatus: report.engineEvaluation.status }, null, 2));
