import zlib from 'node:zlib';

export const DOCUMENT_LIMITS = Object.freeze({ timeoutMs: 8000, maxBytes: 4 * 1024 * 1024 });

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

export async function fetchDocument(url, limits = DOCUMENT_LIMITS) {
  const started = Date.now(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
  const telemetry = { documentUrl: url, status: 0, finalUrl: '', contentType: '', bytes: 0, validation: '', elapsedMs: 0, textExtraction: '', textLength: 0, failureReason: '' };
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'Brokken-Task12-Local/1.0', accept: 'application/pdf,text/html,application/xhtml+xml,*/*' } });
    telemetry.status = response.status; telemetry.finalUrl = response.url; telemetry.contentType = response.headers.get('content-type') || '';
    const declared = Number(response.headers.get('content-length') || 0); if (declared > limits.maxBytes) throw new Error('response-size-limit');
    const body = Buffer.from(await response.arrayBuffer()); telemetry.bytes = body.length; if (body.length > limits.maxBytes) throw new Error('response-size-limit');
    telemetry.validation = classifyDocumentResponse({ status: response.status, contentType: telemetry.contentType, body });
    if (telemetry.validation === 'VALID_PDF') { const extracted = extractPdfText(body); telemetry.textExtraction = extracted.status; telemetry.textLength = extracted.textLength; return { telemetry, body, text: extracted.text }; }
    telemetry.failureReason = telemetry.validation; return { telemetry, body, text: '' };
  } catch (error) { telemetry.failureReason = /abort|timeout/i.test(error.name + error.message) ? 'TIMEOUT' : error.message; telemetry.validation = telemetry.failureReason === 'TIMEOUT' ? 'TIMEOUT' : 'OTHER'; return { telemetry, body: Buffer.alloc(0), text: '' }; }
  finally { clearTimeout(timer); telemetry.elapsedMs = Date.now() - started; }
}
