import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { classifyArticle, detectCityCodes } from '../src/index.js';
import { workbookCityRules } from '../src/city-config.js';
import { extractStructuredListing, rankArticleLinks } from './source-recovery-adapters.mjs';

const root = process.cwd();
const baselinePath = path.join(root, 'reports/source-audits/source-audit-2026-09-30T12-58-19-897Z.json');
const checkpointPath = path.join(root, 'reports/source-audits/task14-targeted-recovery/checkpoint.json');
const positivePath = path.join(root, 'reports/source-audits/task7/positive-controls.json');
const outDir = path.join(root, 'reports/source-audits/task15');
const reportPath = path.join(outDir, 'task15-content-yield-report.json');
const itemPath = path.join(outDir, 'task15-items.jsonl');
const timeoutMs = Math.max(3000, Math.min(Number(process.env.TASK15_TIMEOUT_MS || 6000), 10000));
const concurrency = Math.max(2, Math.min(Number(process.env.TASK15_CONCURRENCY || 6), 8));
const maxLinks = 2;
const windowEnd = new Date('2026-10-01T23:59:59.999Z');
const windowStart = new Date('2026-09-24T00:00:00.000Z');
const parser = new Parser();
const userAgent = 'BrokkerNewsTask15Benchmark/1.0 (local read-only diagnostic)';
const allowedFinalReasons = new Set(['NAVIGATION', 'UNREADABLE', 'NO_DATE', 'STALE', 'NO_REAL_ESTATE_SIGNAL', 'NO_PROJECT_DEVELOPMENT_SIGNAL', 'NEGATIVE', 'OFF_TOPIC', 'NO_GEO', 'AMBIGUOUS_GEO', 'OUTSIDE_SUPPORTED_CITY', 'DUPLICATE', 'QUALITY', 'OCR_REQUIRED', 'OTHER']);

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const absolute = (value, base) => { try { return new URL(String(value || ''), base).toString(); } catch { return ''; } };
const host = (value) => { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; } };
const parseDate = (value) => { const d = new Date(String(value || '').trim()); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isFeed = (probe) => /xml|rss|atom/i.test(probe.contentType || '') || /^\s*<\?xml|<rss\b|<feed\b/i.test(probe.body || '');
const withinWindow = (date) => { const d = new Date(date); return date && d >= windowStart && d <= windowEnd; };
const sameKey = (item) => item.canonicalLink || item.contentLink || `${item.title.toLowerCase()}|${item.cityCodes.join(',')}`;

async function fetchBounded(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8' } });
    const body = await response.text();
    return { ok: response.ok, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '', body, elapsedMs: Date.now() - started, error: response.ok ? '' : `HTTP_${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, finalUrl: '', contentType: '', body: '', elapsedMs: Date.now() - started, error: controller.signal.aborted ? 'TIMEOUT' : error.message };
  } finally { clearTimeout(timer); }
}

async function listingLinks(sourceUrl, probe) {
  if (isFeed(probe)) {
    try {
      const feed = await parser.parseString(probe.body);
      return { method: 'RSS_ATOM', links: (feed.items || []).map((item) => ({ link: absolute(item.link || item.guid, sourceUrl), title: item.title || '', date: parseDate(item.isoDate || item.pubDate || item.date) })).filter((item) => item.link), dates: (feed.items || []).map((item) => parseDate(item.isoDate || item.pubDate || item.date)).filter(Boolean), documents: [] };
    } catch { return { method: 'RSS_ATOM', links: [], dates: [], documents: [] }; }
  }
  const $ = cheerio.load(probe.body || '');
  const generic = [];
  $('a[href]').each((_, el) => {
    const link = absolute($(el).attr('href'), sourceUrl);
    const title = $(el).text().replace(/\s+/g, ' ').trim();
    if (link && host(link) === host(sourceUrl) && (title.length >= 12 || /\.pdf(?:$|\?)/i.test(link))) generic.push({ link, title });
  });
  const structured = extractStructuredListing($, sourceUrl);
  return { method: ['HTML', structured.method].filter(Boolean).join('+'), links: rankArticleLinks([...generic, ...structured.links], sourceUrl).map((item) => ({ ...item, date: item.date || '' })), dates: structured.dates || [], documents: generic.filter((item) => /\.pdf(?:$|\?)/i.test(item.link)).map((item) => item.link) };
}

function dateFrom($) { return $('meta[property="article:published_time"],meta[name="publish-date"],meta[name="date"],time[datetime]').map((_, el) => parseDate($(el).attr('content') || $(el).attr('datetime'))).get().find(Boolean) || ''; }
function languageOf(text, lang) { if (lang) return lang; if (/[ऀ-ॿ]/u.test(text)) return 'hi-or-devanagari'; if (/[஀-௿]/u.test(text)) return 'ta'; if (/[ఀ-౿]/u.test(text)) return 'te'; if (/[઀-૿]/u.test(text)) return 'gu'; if (/[ಀ-೿]/u.test(text)) return 'kn'; return /[A-Za-z]/.test(text) ? 'en' : 'unknown'; }
function geo(text) { const lower = text.toLowerCase(); return [...new Set(workbookCityRules.filter((rule) => [rule.name, rule.code, ...(rule.keywords || [])].filter(Boolean).some((term) => lower.includes(String(term).toLowerCase()))).map((rule) => rule.code))]; }
function primaryReason(item) {
  if (item.document && !item.readable) return 'OCR_REQUIRED';
  if (!item.readable) return 'UNREADABLE';
  if (!item.date) return 'NO_DATE';
  if (!item.inWindow) return 'STALE';
  if (item.classification === 'reject_negative') return 'NEGATIVE';
  if (['unclassified', 'unreadable'].includes(item.classification)) return 'NO_REAL_ESTATE_SIGNAL';
  if (!item.relevance) return 'OFF_TOPIC';
  if (!item.cityCodes.length) return 'NO_GEO';
  if (item.cityCodes.length > 1) return 'AMBIGUOUS_GEO';
  if (!item.supportedCity) return 'OUTSIDE_SUPPORTED_CITY';
  return 'WOULD_PUBLISH';
}
function supportedCodes() { return new Set(workbookCityRules.map((rule) => rule.code)); }
const supportedCityCodes = supportedCodes();

async function inspectArticle(source, candidate) {
  const probe = await fetchBounded(candidate.link);
  const item = { source, rawLink: candidate.link, contentLink: candidate.link, canonicalLink: probe.finalUrl || candidate.link, title: candidate.title || '', readable: false, date: candidate.date || '', inWindow: false, relevance: false, classification: 'unreadable', negative: false, cityCodes: [], supportedCity: false, document: /application\/pdf|\.pdf(?:$|\?)/i.test(`${probe.contentType} ${candidate.link}`), fetchSuccess: probe.ok, fetchStatus: probe.status, elapsedMs: probe.elapsedMs, language: '', thumbnail: false, finalReason: 'OTHER' };
  if (!probe.ok) { item.finalReason = probe.error === 'TIMEOUT' ? 'QUALITY' : 'OTHER'; return item; }
  if (item.document) { item.finalReason = 'OCR_REQUIRED'; return item; }
  const $ = cheerio.load(probe.body || '');
  const text = $('article,[itemprop="articleBody"],.article-content,.story-content,main,body').first().text().replace(/\s+/g, ' ').trim();
  item.title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().replace(/\s+/g, ' ').trim() || item.title;
  item.date = item.date || dateFrom($);
  item.readable = text.length >= 200;
  item.language = languageOf(text, String($('html').attr('lang') || ''));
  item.thumbnail = Boolean($('meta[property="og:image"],meta[name="twitter:image"],img[src]').first().attr('content') || $('img[src]').first().attr('src'));
  const article = { title: item.title, description: text.slice(0, 500), articleText: text, newsLink: candidate.link, sourceUrl: source, publishedAt: item.date };
  item.classification = item.readable ? classifyArticle(article) : 'unreadable';
  item.negative = item.classification === 'reject_negative';
  item.relevance = item.readable && !['unreadable', 'unclassified', 'reject_negative'].includes(item.classification);
  item.cityCodes = item.readable ? detectCityCodes(article) : geo(`${item.title} ${text}`);
  item.cityCodes = [...new Set(item.cityCodes || [])];
  item.supportedCity = item.cityCodes.some((code) => supportedCityCodes.has(code));
  item.inWindow = withinWindow(item.date);
  item.finalReason = primaryReason(item);
  return item;
}

async function inspectSource(row, cohort) {
  const started = Date.now();
  const rootProbe = await fetchBounded(row.url);
  const result = { source: row.url, label: row.label || '', cohort, configuredCities: row.cityCodes || [], listingMethod: '', rawLinks: 0, items: [], rootStatus: rootProbe.status, rootError: rootProbe.error, elapsedMs: 0 };
  if (!rootProbe.ok) { result.elapsedMs = Date.now() - started; return result; }
  const listing = await listingLinks(row.url, rootProbe);
  result.listingMethod = listing.method; result.rawLinks = listing.links.length;
  for (const candidate of listing.links.slice(0, maxLinks)) result.items.push(await inspectArticle(row.url, candidate));
  result.elapsedMs = Date.now() - started;
  return result;
}

async function mapConcurrent(items, worker) { const output = []; let index = 0; async function run() { while (index < items.length) { const i = index++; output[i] = await worker(items[i]); } } await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run)); return output; }
function makeCohorts(baseline, checkpoint) {
  const a = baseline.rows.filter((row) => row.contentHealth === 'HEALTHY');
  const partialIds = new Set(Object.values(checkpoint.results || {}).filter((result) => result.afterStatus === 'PARTIALLY_RECOVERED' && (result.linksDiscovered > 0 || result.documents > 0)).map((result) => result.sourceId));
  const b = baseline.rows.filter((row) => partialIds.has(row.id));
  return { a, b };
}
function emptyCounters() { return { SOURCES_ATTEMPTED: 0, SOURCES_PRODUCTIVE: 0, RAW_LINKS: 0, CONTENT_LINKS: 0, DETAILS_FETCHED: 0, READABLE_ITEMS: 0, DATED_ITEMS: 0, IN_WINDOW_ITEMS: 0, RELEVANCE_PASS: 0, RELEVANCE_FAIL: 0, NEGATIVE_REJECT: 0, REVIEW: 0, GEO_PASS: 0, GEO_FAIL: 0, DUPLICATES: 0, WOULD_PUBLISH: 0 }; }
function summarize(results) {
  const counters = emptyCounters(); const reasons = {}; const allItems = [];
  for (const result of results) {
    counters.SOURCES_ATTEMPTED += 1; counters.RAW_LINKS += result.rawLinks; counters.CONTENT_LINKS += result.items.length; counters.DETAILS_FETCHED += result.items.length;
    if (result.items.some((item) => item.readable && item.inWindow && item.relevance && item.cityCodes.length === 1 && item.supportedCity)) counters.SOURCES_PRODUCTIVE += 1;
    for (const item of result.items) { allItems.push({ ...item, source: result.source }); reasons[item.finalReason] = (reasons[item.finalReason] || 0) + 1; counters.READABLE_ITEMS += Number(item.readable); counters.DATED_ITEMS += Number(Boolean(item.date)); counters.IN_WINDOW_ITEMS += Number(item.inWindow); counters.RELEVANCE_PASS += Number(item.relevance); counters.RELEVANCE_FAIL += Number(!item.relevance); counters.NEGATIVE_REJECT += Number(item.negative); counters.GEO_PASS += Number(item.cityCodes.length === 1 && item.supportedCity); counters.GEO_FAIL += Number(!(item.cityCodes.length === 1 && item.supportedCity)); counters.REVIEW += Number(['NO_GEO', 'AMBIGUOUS_GEO', 'OCR_REQUIRED', 'QUALITY'].includes(item.finalReason)); }
  }
  const seen = new Map(); for (const item of allItems) { const key = sameKey(item); if (seen.has(key)) { item.finalReason = 'DUPLICATE'; counters.DUPLICATES += 1; } else seen.set(key, item); }
  counters.WOULD_PUBLISH = allItems.filter((item) => item.finalReason === 'WOULD_PUBLISH').length;
  return { counters, rejectionReasons: reasons, items: allItems };
}
function cityYield(rows, items) { return workbookCityRules.map((rule) => { const cityItems = items.filter((item) => item.cityCodes.includes(rule.code)); const configured = rows.filter((row) => (row.cityCodes || []).includes(rule.code)).length; return { city: rule.code, configuredSources: configured, benchmarkSources: new Set(rows.filter((row) => (row.cityCodes || []).includes(rule.code)).map((row) => row.url)).size, validPositiveItems: cityItems.filter((item) => item.finalReason === 'WOULD_PUBLISH').length, wouldPublish: cityItems.filter((item) => item.finalReason === 'WOULD_PUBLISH').length, technicalSourceGap: configured === 0, contentGap: cityItems.length === 0 }; }); }
function dedupeSummary(items) { const byCanonical = new Map(); const byTitle = new Map(); for (const item of items) { byCanonical.set(item.canonicalLink, (byCanonical.get(item.canonicalLink) || 0) + 1); const title = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); if (title) byTitle.set(title, (byTitle.get(title) || 0) + 1); } return { exactDuplicates: 0, canonicalDuplicates: [...byCanonical.values()].filter((n) => n > 1).reduce((s, n) => s + n - 1, 0), titleNearDuplicates: [...byTitle.values()].filter((n) => n > 1).reduce((s, n) => s + n - 1, 0), crossSourceSameStoryCandidates: [...byTitle.values()].filter((n) => n > 1).length }; }

await fs.mkdir(outDir, { recursive: true });
const [baseline, checkpoint, positives] = await Promise.all([readJson(baselinePath), readJson(checkpointPath), readJson(positivePath)]);
const cohorts = makeCohorts(baseline, checkpoint);
const selected = [...cohorts.a.map((row) => ({ ...row, cohort: 'A_CONTENT_HEALTHY' })), ...cohorts.b.map((row) => ({ ...row, cohort: 'B_HIGH_CONFIDENCE_PARTIAL' }))];
const results = await mapConcurrent(selected, (row) => inspectSource(row, row.cohort));
const { counters, rejectionReasons, items } = summarize(results);
const manualSample = { accepted: items.filter((item) => item.finalReason === 'WOULD_PUBLISH').slice(0, 20).map((item) => ({ ...item, manualLabel: 'UNCERTAIN' })), rejected: items.filter((item) => item.finalReason !== 'WOULD_PUBLISH' && item.finalReason !== 'NO_GEO').slice(0, 30).map((item) => ({ ...item, manualLabel: 'UNCERTAIN' })), review: items.filter((item) => ['NO_GEO', 'AMBIGUOUS_GEO', 'OCR_REQUIRED', 'QUALITY'].includes(item.finalReason)).slice(0, 100).map((item) => ({ ...item, manualLabel: 'UNCERTAIN' })) };
const allManual = [...manualSample.accepted, ...manualSample.rejected, ...manualSample.review];
const report = { reportType: 'TASK15_CONTENT_YIELD_BENCHMARK', generatedAt: new Date().toISOString(), localOnly: true, benchmarkWindow: { start: windowStart.toISOString(), end: windowEnd.toISOString(), days: 8, note: 'Bounded recent window; source pages were sampled, not historically crawled.' }, frozenBaseline: { path: path.relative(root, baselinePath), sources: 571, cities: 234, contentHealthy: 74, transportFailures: 226, extractionFailures: 80, empty: 78, duplicateSourceRows: 0 }, cohorts: { cohortA: { size: cohorts.a.length, definition: 'contentHealth HEALTHY', results: results.filter((r) => r.cohort === 'A_CONTENT_HEALTHY').length }, cohortB: { size: cohorts.b.length, definition: 'Task 14 partial with discovered links or documents', results: results.filter((r) => r.cohort === 'B_HIGH_CONFIDENCE_PARTIAL').length } }, counters, rejectionReasons, wouldPublishItems: items.filter((item) => item.finalReason === 'WOULD_PUBLISH'), manualValidationSample: { accepted: manualSample.accepted.length, rejected: manualSample.rejected.length, review: manualSample.review.length, labels: { TRUE_VALID: 0, TRUE_INVALID: 0, UNCERTAIN: allManual.length }, note: 'No item was counted as human-verified without independent manual confirmation.' }, classifierMeasurement: { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0, precision: null, recall: null, note: 'Benchmark sample is machine-produced and manually unverified; existing 8-control corpus remains the measured control set.' }, positiveCorpus: { before: positives.length, after: positives.length, added: 0, note: 'No unverified benchmark item was promoted into the positive corpus.' }, negativeProtection: { existingControls: '8/8', additionalConfirmedNegatives: 0, note: 'No classifier changes made.' }, geoMeasurement: { correct: 0, falseNegative: 0, falsePositive: 0, ambiguous: counters.GEO_FAIL, note: 'Human verification is required before geo accuracy is claimed.' }, dedupe: dedupeSummary(items), rera: { sourcesAttempted: results.filter((r) => /rera/i.test(`${r.source} ${r.label}`)).length, readableRecords: items.filter((item) => /rera/i.test(item.source) && item.readable).length, validPositives: items.filter((item) => /rera/i.test(item.source) && item.finalReason === 'WOULD_PUBLISH').length, wouldPublish: items.filter((item) => /rera/i.test(item.source) && item.finalReason === 'WOULD_PUBLISH').length, technicalFailures: results.filter((r) => /rera/i.test(`${r.source} ${r.label}`) && r.rootError).length }, ocr: { ocrRequiredPromisingRecords: items.filter((item) => item.finalReason === 'OCR_REQUIRED').length, engineInstalled: false, note: 'Scanned documents remain review-only; Tesseract was not installed.' }, sourceYield: results.map((result) => ({ source: result.source, cohort: result.cohort, contentItems: result.items.length, validPositives: result.items.filter((item) => item.finalReason === 'WOULD_PUBLISH').length, wouldPublish: result.items.filter((item) => item.finalReason === 'WOULD_PUBLISH').length, uniqueValid: new Set(result.items.filter((item) => item.finalReason === 'WOULD_PUBLISH').map(sameKey)).size })), cityYield: cityYield(selected, items), top20CityCoverageGaps: cityYield(selected, items).filter((row) => row.contentGap || row.technicalSourceGap).sort((a, b) => Number(b.contentGap) - Number(a.contentGap)).slice(0, 20), bottleneckAttribution: {}, manualSamplePath: path.relative(root, path.join(outDir, 'task15-manual-validation-sample.json')), itemPath: path.relative(root, itemPath), filesChanged: [], nextTask16: 'MANUAL_VALIDATION_AND_TARGETED_ADAPTERS', recommendation: 'Do not tune classifier yet. Manually label the deterministic sample, then target the largest measured loss stage.' };
for (const item of items) { const reason = item.finalReason; const key = reason === 'WOULD_PUBLISH' ? 'DEDUPE' : reason === 'OCR_REQUIRED' ? 'OCR' : reason === 'NO_DATE' || reason === 'STALE' ? 'DATE' : reason === 'NO_GEO' || reason === 'AMBIGUOUS_GEO' || reason === 'OUTSIDE_SUPPORTED_CITY' ? 'GEO' : reason === 'NEGATIVE' ? 'NEGATIVE_FILTER' : reason === 'NO_REAL_ESTATE_SIGNAL' || reason === 'OFF_TOPIC' ? 'CLASSIFIER' : reason === 'UNREADABLE' ? 'EXTRACTION' : 'DISCOVERY'; report.bottleneckAttribution[key] = (report.bottleneckAttribution[key] || 0) + 1; }
await fs.writeFile(itemPath, items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : ''));
await fs.writeFile(path.join(outDir, 'task15-manual-validation-sample.json'), JSON.stringify(manualSample, null, 2) + '\n');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ cohorts: report.cohorts, counters, wouldPublish: report.wouldPublishItems.length, rejectionReasons, bottleneckAttribution: report.bottleneckAttribution, report: path.relative(root, reportPath) }, null, 2));
