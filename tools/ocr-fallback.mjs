import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const OCR_LIMITS = Object.freeze({ maxPages: 3, maxPixels: 25_000_000, maxDocumentMs: 15_000, maxBytes: 4 * 1024 * 1024 });

function commandPath(name) {
  try { return execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0] || ''; } catch { return ''; }
}

export function availableOcrTools() {
  return { tesseract: commandPath('tesseract'), pdfinfo: commandPath('pdfinfo'), pdftoppm: commandPath('pdftoppm') };
}

export function pdfHash(body) { return crypto.createHash('sha256').update(body).digest('hex'); }

export function ocrCacheKey({ canonicalDocumentUrl = '', contentHash = '', engine = 'none', language = 'eng' } = {}) {
  return crypto.createHash('sha256').update(`${canonicalDocumentUrl}|${contentHash}|${engine}|${language}`).digest('hex');
}

export function ocrEligibility({ trustedSource, discoveredFromListing, pdfValidation, normalTextUsable, bytes, pages = 0 } = {}) {
  if (!trustedSource || !discoveredFromListing || pdfValidation !== 'VALID_PDF') return 'OCR_UNSUPPORTED';
  if (normalTextUsable) return 'OCR_NOT_NEEDED';
  if (bytes > OCR_LIMITS.maxBytes) return 'OCR_TOO_LARGE';
  if (pages > OCR_LIMITS.maxPages) return 'OCR_TOO_MANY_PAGES';
  return 'OCR_ELIGIBLE';
}

export function validateOcrText(text = '', { minChars = 80 } = {}) {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  const words = normalized.match(/[A-Za-z\u0900-\u097F]{2,}/g) || [];
  const garbled = (normalized.match(/[�]/g) || []).length;
  const alphaRatio = normalized.length ? words.join('').length / normalized.length : 0;
  if (normalized.length < minChars) return { status: 'OCR_EMPTY', text: '', chars: normalized.length, words: words.length, alphaRatio, garbled };
  if (garbled > 3 || alphaRatio < 0.2) return { status: 'OCR_GARBLED', text: '', chars: normalized.length, words: words.length, alphaRatio, garbled };
  if (normalized.length >= 400 && words.length >= 60 && alphaRatio >= 0.35) return { status: 'OCR_HIGH_CONFIDENCE', text: normalized, chars: normalized.length, words: words.length, alphaRatio, garbled };
  return { status: 'OCR_USABLE', text: normalized, chars: normalized.length, words: words.length, alphaRatio, garbled };
}

export function runOcrFallback() {
  const tools = availableOcrTools();
  if (!tools.tesseract || !tools.pdftoppm) return { status: 'OCR_UNSUPPORTED', tools, reason: 'Tesseract and/or PDF renderer is unavailable locally.' };
  return { status: 'OCR_UNSUPPORTED', tools, reason: 'OCR execution adapter is intentionally disabled until language packs and bounded process isolation are provisioned.' };
}
