import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { availableOcrTools, validateOcrText } from './ocr-fallback.mjs';

export const DOCUMENT_LIMITS = Object.freeze({ timeoutMs: 8000, maxBytes: 4 * 1024 * 1024 });
const execFileAsync = promisify(execFile);

export function canonicalUrl(value = '') {
  try { const url = new URL(value); url.hash = ''; return url.href.replace(/\/$/, ''); } catch { return String(value || ''); }
}

export function documentIdentity({ authority = '', noticeNumber = '', registrationNumber = '', documentUrl = '', title = '' } = {}) {
  const stable = noticeNumber || registrationNumber || canonicalUrl(documentUrl) || title.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${authority.trim().toLowerCase()}|${stable}`;
}

export function classifyDocumentResponse({ status = 0, contentType = '', body = Buffer.alloc(0), error = '' } = {}) {
  if (error) return /abort|timeout/i.test(error) ? 'TIMEOUT' : 'OTHER';
  if (status < 200 || status >= 300) return status === 403 ? 'HTTP_403' : status >= 500 ? 'HTTP_5XX' : 'HTTP_ERROR';
  const signature = body.subarray(0, 5).toString('ascii');
  if (/application\/pdf/i.test(contentType) && signature === '%PDF-') return 'VALID_PDF';
  if (signature === '%PDF-') return 'VALID_PDF';
  if (/text\/html|application\/xhtml/i.test(contentType) || /^\s*</.test(body.toString('utf8', 0, 120))) {
    const html = body.toString('utf8', 0, 24000);
    if (/servermaintenance|maintenance page|service unavailable|application error|access denied|captcha|\blogin\b|page not found|temporarily unavailable|generic error/i.test(html)) return 'DOCUMENT_UNAVAILABLE';
    return 'HTML_ERROR_PAGE';
  }
  if (!body.length) return 'EMPTY_DOCUMENT';
  return 'OTHER';
}

function decodePdfLiteral(value) {
  return value.replace(/\\([\\()nrtbf])/g, (_, code) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', '(': '(', ')': ')' }[code] || code))
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function extractLiteralStrings(text) {
  const output = [];
  let start = -1; let escaped = false; let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (start < 0) { if (char === '(') { start = index + 1; depth = 1; escaped = false; } continue; }
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '(') { depth += 1; continue; }
    if (char === ')') { depth -= 1; if (depth === 0) { output.push(decodePdfLiteral(text.slice(start, index))); start = -1; } }
  }
  return output;
}

export function extractPdfText(body) {
  if (!Buffer.isBuffer(body) || body.subarray(0, 5).toString('ascii') !== '%PDF-') return { text: '', status: 'MALFORMED_PDF', textLength: 0 };
  const fragments = [];
  const raw = body.toString('latin1');
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamPattern.exec(raw))) {
    const source = Buffer.from(match[1], 'latin1');
    const candidates = [source];
    try { candidates.unshift(zlib.inflateSync(source)); } catch { /* uncompressed stream */ }
    for (const candidate of candidates) {
      const decoded = candidate.toString('latin1');
      const printableRatio = decoded.length ? (decoded.match(/[\x09\x0A\x0D\x20-\x7E]/g) || []).length / decoded.length : 0;
      if (printableRatio >= 0.65 && /\b(?:BT|Tj|TJ|Tf)\b/.test(decoded)) fragments.push(...extractLiteralStrings(decoded));
    }
  }
  const text = fragments.join(' ').replace(/[^\x09\x0A\x0D\x20-\x7E\u0900-\u097F]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.match(/[A-Za-z\u0900-\u097F]{3,}/g) || [];
  const meaningfulRatio = text.length ? words.join('').length / text.length : 0;
  if (words.length < 12 || meaningfulRatio < 0.2) return { text: '', status: 'IMAGE_ONLY_PDF', textLength: 0 };
  return { text, status: 'TEXT_EXTRACTED', textLength: text.length };
}

async function runOfficialPdfOcr(body, options = {}) {
  const tools = availableOcrTools();
  const requestedLanguages = options.languages || ['eng'];
  const result = {
    status: 'OCR_UNSUPPORTED',
    engine: tools.tesseract || '',
    requestedLanguages,
    languages: [],
    pages: [],
    unsupportedLanguages: [],
    extractionMethod: 'OCR'
  };
  if (!tools.tesseract || !tools.pdfinfo || !tools.pdftoppm) return result;
  const started = Date.now();
  const maxPages = Math.min(Number(options.maxPages || 3), 5);
  const documentTimeoutMs = Number(options.documentTimeoutMs || 15000);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brokket-canonical-ocr-'));
  const pdfPath = path.join(tempDir, 'document.pdf');
  const command = async (file, args, timeout) => {
    try { return { ok: true, stdout: (await execFileAsync(file, args, { timeout, windowsHide: true, maxBuffer: 20 * 1024 * 1024 })).stdout || '' }; }
    catch (error) { return { ok: false, stdout: error.stdout || '', error: error.message || '' }; }
  };
  try {
    await fs.writeFile(pdfPath, body);
    const tessdataDir = options.tessdataDir || (tools.tesseract ? path.join(path.dirname(tools.tesseract), 'tessdata') : '');
    const languageProbe = await command(tools.tesseract, ['--tessdata-dir', tessdataDir, '--list-langs'], 3000);
    const installed = new Set((languageProbe.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    result.unsupportedLanguages = requestedLanguages.filter((language) => !installed.has(language));
    result.languages = requestedLanguages.filter((language) => installed.has(language));
    if (!result.languages.length) return result;
    const pageProbe = await command(tools.pdfinfo, [pdfPath], 3000);
    const pageCount = Number((pageProbe.stdout || '').match(/^Pages:\s+(\d+)/m)?.[1] || 0);
    const pages = Math.min(pageCount || 1, maxPages);
    const texts = [];
    for (let page = 1; page <= pages; page += 1) {
      if (Date.now() - started >= documentTimeoutMs) { result.status = 'OCR_TIMEOUT'; break; }
      const imageBase = path.join(tempDir, `page-${page}`);
      const rendered = await command(tools.pdftoppm, ['-f', String(page), '-l', String(page), '-singlefile', '-r', '150', '-png', pdfPath, imageBase], Math.max(1000, documentTimeoutMs - (Date.now() - started)));
      if (!rendered.ok) { result.pages.push({ page, status: 'OCR_RENDER_FAILED', error: rendered.error }); continue; }
      for (const language of result.languages) {
        if (Date.now() - started >= documentTimeoutMs) { result.status = 'OCR_TIMEOUT'; break; }
        const ocr = await command(tools.tesseract, ['--tessdata-dir', tessdataDir, `${imageBase}.png`, 'stdout', '-l', language, '--psm', '6'], Math.max(1000, documentTimeoutMs - (Date.now() - started)));
        const quality = validateOcrText(ocr.stdout || '', { minChars: 20 });
        result.pages.push({ page, language, status: ocr.ok ? quality.status : 'OCR_FAILED', chars: quality.chars, confidence: quality.status === 'OCR_HIGH_CONFIDENCE' ? 'HIGH' : quality.status === 'OCR_USABLE' ? 'MEDIUM' : 'LOW', text: quality.text, error: ocr.error || '' });
        if (quality.text) texts.push(`[${language} page ${page}] ${quality.text}`);
      }
    }
    const text = texts.join('\n').replace(/\s+/g, ' ').trim();
    result.text = text;
    result.textLength = text.length;
    result.status = text.length >= 20 ? (text.length >= 400 ? 'OCR_HIGH_CONFIDENCE' : 'OCR_PARTIAL') : result.status === 'OCR_TIMEOUT' ? 'OCR_TIMEOUT' : 'OCR_INSUFFICIENT';
    return result;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function extractDocumentBody(body, { contentType = 'application/pdf', status = 200, ocr = null } = {}) {
  const telemetry = {
    status,
    contentType,
    bytes: Buffer.isBuffer(body) ? body.length : 0,
    validation: '',
    textExtraction: '',
    textLength: 0,
    extractionMethod: 'PDF_TEXT',
    ocr: null,
    failureReason: ''
  };
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
  telemetry.validation = classifyDocumentResponse({ status, contentType, body: buffer });
  if (telemetry.validation !== 'VALID_PDF') {
    telemetry.failureReason = telemetry.validation;
    return { telemetry, body: buffer, text: '' };
  }

  const extracted = extractPdfText(buffer);
  telemetry.textExtraction = extracted.status;
  telemetry.textLength = extracted.textLength;
  if (extracted.status === 'IMAGE_ONLY_PDF' && ocr?.trustedSource && ocr?.discoveredFromListing) {
    const ocrResult = await runOfficialPdfOcr(buffer, ocr);
    telemetry.ocr = { ...ocrResult, text: undefined };
    if (ocrResult.text) {
      telemetry.textExtraction = ocrResult.status;
      telemetry.textLength = ocrResult.textLength;
      telemetry.extractionMethod = 'BOUNDED_OCR';
      return { telemetry, body: buffer, text: ocrResult.text };
    }
  }
  return { telemetry, body: buffer, text: extracted.text };
}

export async function fetchDocument(url, limits = DOCUMENT_LIMITS, options = {}) {
  const started = Date.now(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
  const telemetry = { documentUrl: url, status: 0, finalUrl: '', contentType: '', bytes: 0, validation: '', elapsedMs: 0, textExtraction: '', textLength: 0, extractionMethod: 'PDF_TEXT', ocr: null, failureReason: '' };
  try {
    const signal = options.signal && typeof AbortSignal !== 'undefined' && AbortSignal.any
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;
    if (options.signal && !AbortSignal.any) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const response = await fetch(url, { redirect: 'follow', signal, headers: { 'user-agent': 'Brokket-Document-Ingestion/1.0', accept: 'application/pdf,text/html,application/xhtml+xml,*/*' } });
    telemetry.status = response.status; telemetry.finalUrl = response.url; telemetry.contentType = response.headers.get('content-type') || '';
    const declared = Number(response.headers.get('content-length') || 0); if (declared > limits.maxBytes) throw new Error('response-size-limit');
    const body = Buffer.from(await response.arrayBuffer()); telemetry.bytes = body.length; if (body.length > limits.maxBytes) throw new Error('response-size-limit');
    telemetry.validation = classifyDocumentResponse({ status: response.status, contentType: telemetry.contentType, body });
    if (telemetry.validation === 'VALID_PDF') {
      const extracted = await extractDocumentBody(body, { contentType: telemetry.contentType, status: response.status, ocr: options.ocr });
      Object.assign(telemetry, extracted.telemetry, {
        documentUrl: url,
        finalUrl: response.url,
        elapsedMs: telemetry.elapsedMs
      });
      return { telemetry, body, text: extracted.text };
    }
    telemetry.failureReason = telemetry.validation; return { telemetry, body, text: '' };
  } catch (error) { telemetry.failureReason = /abort|timeout/i.test(error.name + error.message) ? 'TIMEOUT' : error.message; telemetry.validation = telemetry.failureReason === 'TIMEOUT' ? 'TIMEOUT' : 'OTHER'; return { telemetry, body: Buffer.alloc(0), text: '' }; }
  finally { clearTimeout(timer); telemetry.elapsedMs = Date.now() - started; }
}
