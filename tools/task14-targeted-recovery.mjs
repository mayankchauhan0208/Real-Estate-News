import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { classifyArticle, detectCityCodes } from '../src/index.js';
import { extractStructuredListing, rankArticleLinks } from './source-recovery-adapters.mjs';

const root = process.cwd();
const auditPath = path.join(root, 'reports/source-audits/source-audit-2026-09-30T12-58-19-897Z.json');
const outDir = path.join(root, 'reports/source-audits/task14-targeted-recovery');
const checkpointPath = path.join(outDir, 'checkpoint.json');
const reportPath = path.join(outDir, 'task14-targeted-recovery-report.json');
const batchSize = Math.max(10, Math.min(Number(process.env.TARGETED_RECOVERY_BATCH_SIZE || 20), 25));
const timeoutMs = Math.max(3000, Math.min(Number(process.env.TARGETED_RECOVERY_TIMEOUT_MS || 8000), 12000));
const attemptsLimit = 2;
const concurrency = 4;
const parser = new Parser();
const userAgent = 'BrokkerNewsTargetedRecovery/1.0 (bounded read-only diagnostic)';
await fs.mkdir(outDir, { recursive: true });

const readJson = async (file, fallback) => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } };
const baseline = await readJson(auditPath, null);
if (!baseline) throw new Error(`Missing frozen baseline: ${auditPath}`);
const prior = await readJson(checkpointPath, { version: 1, baseline: path.relative(root, auditPath), results: {}, batches: [] });

function state(row) {
  if (row.contentHealth === 'HEALTHY') return 'CONTENT_HEALTHY';
  if (row.contentHealth === 'TRANSPORT_FAILED') return 'TRANSPORT_FAILURE';
  if (row.contentHealth === 'EXTRACTION_FAILED') return 'EXTRACTION_FAILURE';
  if (row.contentHealth === 'EMPTY') return 'EMPTY';
  if (row.contentHealth === 'STALE') return 'STALE';
  if (row.contentHealth === 'BROKEN_URL') return 'BROKEN_URL';
  if (row.contentHealth === 'BLOCKED') return 'BLOCKED';
  return 'NEEDS_REVIEW';
}
function isRera(row) { return /(^|[^a-z])rera([^a-z]|$)/i.test(`${row.url} ${row.label || ''}`); }
function isOfficial(row) { return /\.gov\.in|\.gov$|authority|development|housing|municipal|metro|nhai|port|airport|hsvphry|mhada/i.test(`${row.url} ${row.label || ''}`); }
function queueClass(row) {
  const high = isRera(row) || isOfficial(row);
  if (high && isRera(row) && ['TRANSPORT_FAILURE', 'BLOCKED', 'BROKEN_URL'].includes(state(row))) return 'P0A_RERA_TRANSPORT';
  if (high && ['EXTRACTION_FAILURE', 'EMPTY', 'NEEDS_REVIEW'].includes(state(row))) return isRera(row) ? 'P0B_RERA_EXTRACTION' : 'P0B_AUTHORITY_EXTRACTION';
  if (high && state(row) === 'TRANSPORT_FAILURE') return 'P0A_AUTHORITY_TRANSPORT';
  if (/realty|property|builder|developer|construction|infra|housing/i.test(`${row.url} ${row.label || ''}`)) return 'P1_HIGH_VALUE';
  if (['EMPTY', 'NEEDS_REVIEW'].includes(state(row))) return 'P2_REVIEW_EMPTY';
  return 'P3_LOW_VALUE';
}
function failureCategory(error, phase = 'unknown') {
  const text = String(error || '').toLowerCase();
  if (/403/.test(text)) return 'EXTERNAL_BLOCK_403';
  if (/404/.test(text)) return 'BROKEN_URL';
  if (/tls|certificate|ssl/.test(text)) return 'TLS_TIMEOUT';
  if (/ttfb/.test(text)) return 'TTFB_TIMEOUT';
  if (/read timeout/.test(text)) return 'READ_TIMEOUT';
  if (/5xx|\b50[0-9]\b/.test(text)) return 'SERVER_5XX';
  if (/connect/.test(text)) return 'CONNECT_TIMEOUT';
  return phase === 'read' ? 'READ_TIMEOUT' : 'ENVIRONMENT_SPECIFIC_FAILURE';
}
function absolute(value, base) { try { return new URL(String(value || ''), base).toString(); } catch { return ''; } }
function host(value) { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; } }
function parseDate(value) { const date = new Date(String(value || '').trim()); return Number.isNaN(date.getTime()) ? '' : date.toISOString(); }
function isFeed(body, type) { return /xml|rss|atom/i.test(type || '') || /^\s*<\?xml|<rss\b|<feed\b/i.test(body); }

async function fetchBounded(url) {
  const controller = new AbortController();
  let timer;
  try {
    const response = await Promise.race([
      fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8' } }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('TTFB_TIMEOUT')), timeoutMs); })
    ]);
    clearTimeout(timer);
    if (response.status === 403 || response.status === 404) return { ok: false, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '', body: '', error: String(response.status), failureCategory: response.status === 403 ? 'EXTERNAL_BLOCK_403' : 'BROKEN_URL' };
    let body = '';
    try {
      body = await Promise.race([response.text(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('READ_TIMEOUT')), timeoutMs); })]);
      clearTimeout(timer);
    } catch (error) {
      controller.abort(); clearTimeout(timer); return { ok: false, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '', body: '', error: error.message, failureCategory: failureCategory(error.message, 'read') };
    }
    return { ok: response.ok, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '', body, error: response.ok ? '' : String(response.status), failureCategory: response.ok ? '' : failureCategory(String(response.status)) };
  } catch (error) {
    clearTimeout(timer); controller.abort(); return { ok: false, status: 0, finalUrl: '', contentType: '', body: '', error: error.message, failureCategory: failureCategory(error.message) };
  }
}
async function fetchWithRetries(url) {
  const tries = [];
  let lastResult = null;
  for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
    const result = await fetchBounded(url);
    lastResult = result;
    tries.push({ attempt, status: result.status, error: result.error, failureCategory: result.failureCategory });
    if (result.ok || ['EXTERNAL_BLOCK_403', 'BROKEN_URL'].includes(result.failureCategory)) return { ...result, attempts: tries };
    if (attempt < attemptsLimit) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }
  return { ...lastResult, attempts: tries };
}
function listingLinks(sourceUrl, probe) {
  if (isFeed(probe.body, probe.contentType)) return parser.parseString(probe.body).then((feed) => ({ method: /atom/i.test(probe.contentType) ? 'ATOM' : 'RSS', candidates: (feed.items || []).map((item) => ({ link: absolute(item.link || item.guid, sourceUrl), title: item.title || '', date: parseDate(item.isoDate || item.pubDate || item.date) })).filter((item) => item.link), dates: (feed.items || []).map((item) => parseDate(item.isoDate || item.pubDate || item.date)).filter(Boolean), documents: [] }));
  const $ = cheerio.load(probe.body || '');
  const generic = [];
  $('a[href]').each((_, el) => { const link = absolute($(el).attr('href'), sourceUrl); const title = $(el).text().replace(/\s+/g, ' ').trim(); if (link && host(link) === host(sourceUrl) && (title.length >= 12 || /\.pdf(?:$|\?)/i.test(link))) generic.push({ link, title }); });
  const structured = extractStructuredListing($, sourceUrl);
  const dates = $('time[datetime],meta[property="article:published_time"],meta[name="publish-date"],meta[name="date"]').map((_, el) => parseDate($(el).attr('datetime') || $(el).attr('content'))).get().filter(Boolean);
  return Promise.resolve({ method: ['HTML', structured.method].filter(Boolean).join('+'), candidates: rankArticleLinks([...generic, ...structured.links], sourceUrl), dates: [...new Set([...dates, ...structured.dates])], documents: generic.filter((item) => /\.pdf(?:$|\?)/i.test(item.link)).map((item) => item.link) });
}
async function inspectArticle(link, sourceUrl, expectedCities) {
  const probe = await fetchWithRetries(link);
  if (!probe.ok) return { link, readable: false, date: '', relevant: false, cityCodes: [], failureCategory: probe.failureCategory, attempts: probe.attempts };
  if (/application\/pdf|\.pdf(?:$|\?)/i.test(probe.contentType + link)) return { link, readable: false, date: '', relevant: false, cityCodes: [], document: true, failureCategory: 'PDF_REVIEW_REQUIRED', attempts: probe.attempts };
  const $ = cheerio.load(probe.body || '');
  const text = $('article,[itemprop="articleBody"],.article-content,.story-content,main,body').first().text().replace(/\s+/g, ' ').trim();
  const date = $('meta[property="article:published_time"],meta[name="publish-date"],time[datetime]').map((_, el) => parseDate($(el).attr('content') || $(el).attr('datetime'))).get().find(Boolean) || '';
  const article = { title: $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().trim(), description: text.slice(0, 500), articleText: text, newsLink: link, sourceUrl, publishedAt: date };
  const classification = text.length >= 200 ? classifyArticle(article) : 'unreadable';
  const cityCodes = text.length >= 200 ? detectCityCodes(article) : [];
  return { link, readable: text.length >= 200, date, relevant: !['unreadable', 'unclassified', 'reject_negative'].includes(classification), classification, cityCodes, expectedCities, attempts: probe.attempts };
}
async function inspectSource(row) {
  const started = Date.now();
  const before = state(row); const category = queueClass(row); const root = await fetchWithRetries(row.url);
  const base = { sourceId: row.id, source: row.url, label: row.label, cityCodes: row.cityCodes || [], priority: category, beforeState: before, attemptedAt: new Date().toISOString(), attempts: root.attempts, status: root.status || '', finalUrl: root.finalUrl || '', contentType: root.contentType || '', elapsedMs: Date.now() - started, failureCategory: root.failureCategory || '', recoveryAction: '', afterStatus: 'UNRESOLVED', externalBlocker: false, listingMethod: '', linksDiscovered: 0, fullContentReadable: 0, dateAvailable: 0, relevant: 0, geoEvidence: 0, documents: 0, detailResults: [] };
  if (!root.ok) { base.afterStatus = root.failureCategory === 'EXTERNAL_BLOCK_403' ? 'EXTERNAL_BLOCK' : root.failureCategory === 'BROKEN_URL' ? 'BROKEN' : root.failureCategory?.includes('TIMEOUT') ? 'TIMEOUT' : 'EXTERNAL_BLOCK'; base.externalBlocker = ['EXTERNAL_BLOCK_403', 'TIMEOUT', 'SITE_UNAVAILABLE', 'ENVIRONMENT_SPECIFIC_FAILURE'].some((value) => base.afterStatus === value || root.failureCategory === value); base.recoveryAction = base.afterStatus === 'EXTERNAL_BLOCK' ? 'Remove from repeated retry loop; retain debt entry' : 'Bounded retry exhausted; recheck later from a different network context'; return base; }
  try {
    const listing = await listingLinks(row.url, root); base.listingMethod = listing.method; base.linksDiscovered = listing.candidates.length; base.documents = listing.documents.length;
    const details = [];
    for (const candidate of listing.candidates.slice(0, 2)) details.push(await inspectArticle(candidate.link, row.url, row.cityCodes || []));
    base.detailResults = details; base.fullContentReadable = details.filter((item) => item.readable).length; base.dateAvailable = details.filter((item) => item.date).length; base.relevant = details.filter((item) => item.relevant).length; base.geoEvidence = details.filter((item) => item.cityCodes?.length || row.cityCodes?.length).length;
    if (!listing.candidates.length) { base.afterStatus = root.body.length > 1000 ? 'EXTRACTION_ADAPTER_NEEDED' : 'EMPTY_CONFIRMED'; base.recoveryAction = base.afterStatus === 'EMPTY_CONFIRMED' ? 'Keep as empty until a verified listing appears' : 'Add source-specific discovery adapter only with evidence'; }
    else if (base.fullContentReadable > 0 && base.dateAvailable > 0 && base.relevant > 0 && base.geoEvidence > 0) { base.afterStatus = 'RECOVERED'; base.recoveryAction = 'Promote to targeted productive-health validation'; }
    else if (base.fullContentReadable > 0 || base.documents > 0) { base.afterStatus = 'PARTIALLY_RECOVERED'; base.recoveryAction = base.documents > 0 ? 'Document reached; keep review-only until extraction is validated' : 'Readable detail found; date/relevance/geo still needs validation'; }
    else { base.afterStatus = 'EXTRACTION_ADAPTER_NEEDED'; base.recoveryAction = 'Cluster with shared listing/detail adapter work'; }
  } catch (error) { base.afterStatus = 'EXTRACTION_ADAPTER_NEEDED'; base.failureCategory = error.message; base.recoveryAction = 'Parser or structured-data adapter required'; }
  return base;
}
async function mapWithConcurrency(items, limit, worker) {
  const result = new Array(items.length);
  const checkpointResults = { ...prior.results };
  let index = 0;
  async function run() {
    while (index < items.length) {
      const i = index++;
      result[i] = await worker(items[i]);
      checkpointResults[items[i].id] = result[i];
      await fs.writeFile(checkpointPath, JSON.stringify({ ...prior, results: checkpointResults }, null, 2));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return result;
}

const rows = baseline.rows.filter((row) => ['TRANSPORT_FAILED', 'EXTRACTION_FAILED', 'EMPTY', 'NEEDS_REVIEW', 'BLOCKED'].includes(row.contentHealth)).map((row) => ({ ...row, queueClass: queueClass(row) }));
const rank = { P0A_RERA_TRANSPORT: 0, P0A_AUTHORITY_TRANSPORT: 1, P0B_RERA_EXTRACTION: 2, P0B_AUTHORITY_EXTRACTION: 3, P1_HIGH_VALUE: 4, P2_REVIEW_EMPTY: 5, P3_LOW_VALUE: 6 };
const queue = rows.sort((a, b) => (rank[a.queueClass] - rank[b.queueClass]) || String(a.url).localeCompare(String(b.url))).filter((row) => !prior.results[row.id]);
const batch = queue.slice(0, batchSize); const results = await mapWithConcurrency(batch, concurrency, inspectSource);
const allResults = { ...prior.results, ...Object.fromEntries(results.map((result) => [result.sourceId, result])) };
const batches = [...(prior.batches || []), { batchId: new Date().toISOString(), size: results.length, sources: results.map((result) => result.source), runtimeMs: results.reduce((max, result) => Math.max(max, result.elapsedMs || 0), 0) }];
await fs.writeFile(checkpointPath, JSON.stringify({ version: 1, baseline: path.relative(root, auditPath), attemptsLimit, timeoutMs, results: allResults, batches }, null, 2) + '\n');
const values = Object.values(allResults); const report = { reportType: 'TASK14_TARGETED_RECOVERY', generatedAt: new Date().toISOString(), authoritativeBaseline: { path: path.relative(root, auditPath), sources: 571, contentHealthy: 74, transportFailures: 226, extractionFailures: 80, empty: 78, duplicateRows: 0 }, targetedSourcesAttempted: values.length, currentBatch: { size: results.length, sources: results.map((result) => result.source) }, counts: Object.fromEntries(['RECOVERED', 'PARTIALLY_RECOVERED', 'EXTERNAL_BLOCK', 'TIMEOUT', 'BROKEN', 'EXTRACTION_ADAPTER_NEEDED', 'EMPTY_CONFIRMED', 'UNRESOLVED'].map((key) => [key, values.filter((result) => result.afterStatus === key).length])), confirmed403: values.filter((result) => result.failureCategory === 'EXTERNAL_BLOCK_403').map((result) => result.source), timeoutClasses: Object.fromEntries([...new Set(values.filter((result) => result.afterStatus === 'TIMEOUT').map((result) => result.failureCategory))].map((key) => [key, values.filter((result) => result.failureCategory === key).length])), rera: { attempted: values.filter((result) => /rera/i.test(result.source + result.label)).length, recovered: values.filter((result) => /rera/i.test(result.source + result.label) && result.afterStatus === 'RECOVERED').length, blockers: values.filter((result) => /rera/i.test(result.source + result.label) && ['EXTERNAL_BLOCK', 'TIMEOUT'].includes(result.afterStatus)).map((result) => ({ source: result.source, status: result.afterStatus, failureCategory: result.failureCategory, cities: result.cityCodes })) }, productiveHealthEvidence: { demonstrated: values.filter((result) => result.afterStatus === 'RECOVERED').length, estimatedContentHealthy: 74 + values.filter((result) => result.afterStatus === 'RECOVERED').length, note: 'Estimated only; counts confirmed only after a same-source validation run.' }, checkpoint: path.relative(root, checkpointPath), debtRemaining: queue.slice(batch.length).map((row) => ({ source: row.url, label: row.label, queueClass: row.queueClass, beforeState: state(row), cityCodes: row.cityCodes || [] })) };
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ batch: results.length, totalAttempted: values.length, counts: report.counts, rera: report.rera, checkpoint: report.checkpoint }, null, 2));
