import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = process.cwd();
const outDir = path.join(root, 'reports', 'source-audits', 'task8');
await fs.mkdir(outDir, { recursive: true });
const LIMITS = { timeoutMs: 15000, maxBytes: 4 * 1024 * 1024, maxItems: 40, maxPostbacks: 8, maxDepth: 2 };
const abs = (href, base) => { try { return new URL(href, base).href; } catch { return ''; } };
const canon = (value) => { try { const u = new URL(value); u.hash = ''; return u.href.replace(/\/$/, ''); } catch { return String(value || ''); } };
const classifyLink = ({ href = '', text = '' }) => {
  const value = `${href} ${text}`.toLowerCase();
  if (/javascript:.*__dopostback|__eventtarget/.test(value)) return 'POSTBACK_DOCUMENT';
  if (/\.pdf(?:[?#]|$)/i.test(href)) return 'PDF';
  if (/press.?release|view file|release/.test(value)) return 'PRESS_RELEASE';
  if (/notice|public notice/.test(value)) return 'NOTICE';
  if (/order|आदेश/.test(value)) return 'ORDER';
  if (/circular|परिपत्र/.test(value)) return 'CIRCULAR';
  if (/project|registration|परियोजना|पंजीकरण/.test(value)) return 'PROJECT_DETAIL';
  if (/download|document|brochure|certificate/.test(value)) return 'DOCUMENT';
  if (/next|page=|pagination/.test(value)) return 'PAGINATION';
  if (/about|home|contact|login|menu|sitemap/.test(value)) return 'NAVIGATION';
  return /^https?:/i.test(href) ? 'DETAIL_PAGE' : 'UNKNOWN';
};
async function fetchBounded(url) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), LIMITS.timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'Brokken-Task8-Local/1.0', accept: 'text/html,application/xhtml+xml,application/pdf,*/*' } });
    const declared = Number(response.headers.get('content-length') || 0); if (declared > LIMITS.maxBytes) throw new Error('response-size-limit');
    const body = Buffer.from(await response.arrayBuffer()); if (body.length > LIMITS.maxBytes) throw new Error('response-size-limit');
    const contentType = response.headers.get('content-type') || ''; return { response, body, contentType, isPdf: /application\/pdf/i.test(contentType) || body.subarray(0, 5).toString() === '%PDF-' };
  } finally { clearTimeout(timer); }
}
function relation(fields) { return { sourceUrl: fields.sourceUrl, listingUrl: fields.listingUrl, detailUrl: fields.detailUrl || '', documentUrl: fields.documentUrl || '', canonicalUrl: canon(fields.canonicalUrl || fields.documentUrl || fields.detailUrl || fields.listingUrl), discoveryMethod: fields.discoveryMethod, parentUrl: fields.parentUrl, depth: fields.depth, contentType: fields.contentType || '', recordType: fields.recordType || 'UNKNOWN', title: fields.title || '', date: fields.date || '' }; }
function telemetry(source) { return { source, listingFetch: 'NOT_RUN', itemsFound: 0, itemsClassified: 0, detailRequests: 0, documentRequests: 0, detailSuccess: 0, documentSuccess: 0, textSuccess: 0, dateSuccess: 0, duplicates: 0, failures: 0, timeouts: 0, totalRuntime: 0 }; }
function isErrorPage(body) { return /servermaintenance|captcha|access denied|error occurred/i.test(body.toString('utf8').slice(0, 20000)); }

async function discoverUpRera() {
  const source = 'https://www.up-rera.in/PressRelease'; const t = telemetry(source); const start = Date.now(); const records = [];
  try {
    const listing = await fetchBounded(source); t.listingFetch = listing.response.status; const $ = cheerio.load(listing.body.toString('utf8'));
    const rows = $('table tr').toArray().map((el) => { const row = $(el); const cells = row.find('td'); const a = row.find('a').last(); const href = a.attr('href') || ''; return { title: row.find('span[id$="lblDescription"]').text().replace(/\s+/g, ' ').trim() || cells.eq(1).text().replace(/\s+/g, ' ').trim(), date: row.find('span[id$="lbldate"]').text().trim() || cells.eq(2).text().trim(), href, target: href.match(/__doPostBack\('([^']+)'/)?.[1] || '' }; }).filter((row) => row.title && row.date);
    t.itemsFound = rows.length; t.itemsClassified = rows.filter((row) => classifyLink(row) === 'POSTBACK_DOCUMENT').length;
    const target = rows.find((row) => /UP RERA Approves 13 Real Estate Projects/i.test(row.title)); if (!target) return { telemetry: t, records, result: 'VERIFIED_CONTROL_NOT_VISIBLE' };
    const data = new URLSearchParams(); $('form').first().find('input[type=hidden][name]').each((_, el) => data.set($(el).attr('name'), $(el).attr('value') || '')); data.set('__EVENTTARGET', target.target); data.set('__EVENTARGUMENT', ''); t.documentRequests++;
    const post = await fetch(source, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(LIMITS.timeoutMs), headers: { 'content-type': 'application/x-www-form-urlencoded', referer: source, 'user-agent': 'Brokken-Task8-Local/1.0' }, body: data }); const location = post.headers.get('location') || '';
    if (post.status >= 300 && post.status < 400 && location) { const documentUrl = abs(location, source); const result = await fetchBounded(documentUrl); const valid = !isErrorPage(result.body) && (result.isPdf || result.body.length > 0); if (valid && result.isPdf) t.documentSuccess++; if (valid) t.textSuccess++; if (valid) records.push(relation({ sourceUrl: source, listingUrl: source, documentUrl, canonicalUrl: documentUrl, discoveryMethod: 'POSTBACK_DOCUMENT', parentUrl: source, depth: 2, contentType: result.contentType, recordType: 'PRESS_RELEASE', title: target.title, date: target.date })); else t.failures++; return { telemetry: t, records, result: valid ? 'POSTBACK_DOCUMENT_RECOVERED' : 'POSTBACK_ERROR_PAGE' }; }
    t.failures++; records.push(relation({ sourceUrl: source, listingUrl: source, canonicalUrl: source, discoveryMethod: 'POSTBACK_DOCUMENT', parentUrl: source, depth: 1, recordType: 'PRESS_RELEASE', title: target.title, date: target.date })); return { telemetry: t, records, result: `POSTBACK_FAILED_${post.status}` };
  } catch (error) { t.failures++; if (error.name === 'AbortError' || /timeout/i.test(error.message)) t.timeouts++; return { telemetry: t, records, result: `FAILED_${error.message}` }; } finally { t.totalRuntime = Date.now() - start; }
}

async function discoverHtml(source) {
  const t = telemetry(source); const start = Date.now(); const records = []; const seen = new Set();
  try {
    const listing = await fetchBounded(source); t.listingFetch = listing.response.status; const $ = cheerio.load(listing.body.toString('utf8')); const links = $('a[href]').toArray().map((el) => ({ href: abs($(el).attr('href') || '', source), text: $(el).text().replace(/\s+/g, ' ').trim() })).filter((item) => item.href && classifyLink(item) !== 'NAVIGATION'); t.itemsFound = links.length; t.itemsClassified = links.length;
    for (const item of links.slice(0, LIMITS.maxItems)) { const kind = classifyLink(item); const key = canon(item.href); if (seen.has(key)) { t.duplicates++; continue; } seen.add(key); if (!/pdf|document|housing|project|registration|circular|notice|order/i.test(`${item.href} ${item.text}`)) continue; const child = await fetchBounded(item.href); t.detailRequests++; if (!child.response.ok) { t.failures++; continue; } t.detailSuccess++; if (child.isPdf) { t.documentSuccess++; t.textSuccess++; } else if (!isErrorPage(child.body) && child.body.length) t.textSuccess++; records.push(relation({ sourceUrl: source, listingUrl: source, detailUrl: child.isPdf ? '' : item.href, documentUrl: child.isPdf ? item.href : '', canonicalUrl: item.href, discoveryMethod: child.isPdf ? 'DIRECT_LINK' : 'DETAIL_THEN_DOCUMENT', parentUrl: source, depth: 1, contentType: child.contentType, recordType: kind, title: item.text })); }
    return { telemetry: t, records, result: 'COMPLETED' };
  } catch (error) { t.failures++; if (error.name === 'AbortError' || /timeout/i.test(error.message)) t.timeouts++; return { telemetry: t, records, result: `FAILED_${error.message}` }; } finally { t.totalRuntime = Date.now() - start; }
}

const live = { upRera: await discoverUpRera(), ddaEnglish: await discoverHtml('https://dda.gov.in/whats-new'), ddaHindi: await discoverHtml('https://dda.gov.in/hi/whats-new'), goaRera: await discoverHtml('https://rera.goa.gov.in/') };
const allRecords = Object.values(live).flatMap((entry) => entry.records); const counts = new Map(); for (const item of allRecords) counts.set(item.canonicalUrl, (counts.get(item.canonicalUrl) || 0) + 1);
const report = { generatedAt: new Date().toISOString(), limits: LIMITS, live, automaticControlsDiscovered: 0, task7Baseline: { controls: 8, discovery: 0 }, automaticDiscoveryRecall: 0, duplicateCanonicalRecords: [...counts.values()].filter((count) => count > 1).length, note: 'Diagnostic-only live run. A verified control counts only when reached from its configured listing; no manually supplied final URL is counted.' };
await fs.writeFile(path.join(outDir, 'task8-live-discovery-report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
