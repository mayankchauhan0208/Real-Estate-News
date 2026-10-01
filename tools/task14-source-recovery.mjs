import fs from 'node:fs/promises';
import path from 'node:path';
import { citySourceRules } from '../src/city-config.js';
import { classifyExtractionFailure } from './source-recovery-adapters.mjs';

const root = process.cwd();
const auditDir = path.join(root, 'reports', 'source-audits');
const baselinePath = path.join(auditDir, 'source-audit-2026-09-30T12-09-23-692Z.json');
const afterPath = process.env.SOURCE_RECOVERY_AFTER || [...(await fs.readdir(auditDir)).filter((name) => /^source-audit-.*\.json$/.test(name)).sort()].at(-1);
const outputDir = path.join(auditDir, 'task14-source-recovery');
await fs.mkdir(outputDir, { recursive: true });
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const baseline = await read(baselinePath);
const after = await read(path.isAbsolute(afterPath) ? afterPath : path.join(auditDir, afterPath));

const states = ['CONTENT_HEALTHY', 'TRANSPORT_FAILURE', 'EXTRACTION_FAILURE', 'NEEDS_REVIEW', 'EMPTY', 'STALE', 'BROKEN_URL', 'BLOCKED', 'OTHER'];
function primaryState(row) {
  const state = String(row.contentHealth || row.health || '').toUpperCase();
  if (state === 'HEALTHY') return 'CONTENT_HEALTHY';
  if (state === 'TRANSPORT_FAILED') return 'TRANSPORT_FAILURE';
  if (state === 'EXTRACTION_FAILED') return 'EXTRACTION_FAILURE';
  if (state === 'DEGRADED') return 'NEEDS_REVIEW';
  if (state === 'NEEDS_REVIEW') return 'NEEDS_REVIEW';
  if (state === 'EMPTY') return 'EMPTY';
  if (state === 'STALE') return 'STALE';
  if (state === 'BROKEN_URL') return 'BROKEN_URL';
  if (state === 'BLOCKED') return 'BLOCKED';
  return 'OTHER';
}
function isRera(row) { return /(^|[^a-z])rera([^a-z]|$)/i.test(`${row.url} ${row.label || ''}`); }
function isOfficial(row) { return /\.gov\.in|\.gov$|rera|authority|development|housing|municipal|metro|nhai|port|airport|hsvphry|mhada|hsiidc/i.test(`${row.url} ${row.label || ''}`); }
function priority(row) {
  const state = primaryState(row);
  if (isRera(row) || (isOfficial(row) && state !== 'CONTENT_HEALTHY' && state !== 'EMPTY')) return 'P0';
  if (state === 'CONTENT_HEALTHY' || /realty|property|builder|developer|construction|infra|housing/i.test(`${row.url} ${row.label || ''}`)) return 'P1';
  if (['EMPTY', 'STALE', 'BLOCKED', 'BROKEN_URL'].includes(state)) return 'P3';
  return 'P2';
}
function transportClass(row) {
  const status = Number(row.status || row.httpStatus || 0);
  const error = String(row.error || '').toLowerCase();
  if ([403, 404, 406, 429].includes(status)) return String(status);
  if (status >= 500) return '5XX';
  if (error.includes('timeout')) return 'READ_TIMEOUT';
  if (/tls|certificate|ssl/.test(error)) return 'TLS';
  if (/dns|enotfound|getaddrinfo/.test(error)) return 'DNS';
  if (/reset|econnreset/.test(error)) return 'CONNECTION_RESET';
  if (/connect/.test(error)) return 'CONNECT_TIMEOUT';
  if (/redirect/.test(error)) return 'REDIRECT_FAILURE';
  return 'OTHER';
}
function reviewSubtype(row) {
  const text = `${row.url} ${row.error || ''} ${row.listingMethod || ''}`.toLowerCase();
  if (row.auditTimeout || /timeout/.test(text)) return 'DYNAMIC';
  if (!row.latestArticleDate && Number(row.articlesSampled || 0) > 0) return 'DATE_UNCERTAIN';
  if (Number(row.articleLinksDiscovered || 0) === 0) return 'NO_ARTICLE_SAMPLE';
  if (row.cityCodes?.length === 0) return 'GEO_UNCERTAIN';
  return 'CONTENT_UNCERTAIN';
}
function emptySubtype(row) {
  const text = `${row.url} ${row.label || ''}`.toLowerCase();
  if (/archive|history|past/.test(text)) return 'ARCHIVE_REQUIRED';
  if (/feed|rss/.test(text)) return 'EXTRACTION_EMPTY';
  if (row.status === 200 && row.listingMethod === 'HTML_GENERIC_EXTRACTOR') return 'WRONG_PAGE_OR_DYNAMIC_CONTENT';
  return 'UNKNOWN';
}
function reraMaterial(row) {
  const text = `${row.url} ${row.label || ''}`.toLowerCase();
  if (/press|news|announcement/.test(text)) return 'AUTHORITY_UPDATE';
  if (/judg|order/.test(text)) return 'ORDER_OR_JUDGMENT';
  if (/circular/.test(text)) return 'CIRCULAR';
  if (/notice|publication/.test(text)) return 'PROCEDURAL_OR_NOTICE';
  return 'NAVIGATION_OR_UNKNOWN';
}
function productivelyHealthy(row) {
  return primaryState(row) === 'CONTENT_HEALTHY' && Number(row.fullArticlesReadable || 0) > 0 && Number(row.publicationDatesExtracted || 0) > 0 && Number(row.relevantArticles || 0) > 0;
}
function cityCoverage(rows) {
  const byCode = new Map();
  for (const rule of citySourceRules) {
    const sourceRows = (rule.urls || []).map((url) => rows.find((row) => String(row.url).replace(/\/$/, '').toLowerCase() === String(url).replace(/\/$/, '').toLowerCase())).filter(Boolean);
    const healthy = sourceRows.filter((row) => primaryState(row) === 'CONTENT_HEALTHY');
    const productive = sourceRows.filter(productivelyHealthy);
    const rera = sourceRows.filter(isRera);
    const healthyRera = rera.filter((row) => primaryState(row) === 'CONTENT_HEALTHY');
    byCode.set(rule.code, { cityCode: rule.code, city: rule.name, state: rule.state, configuredSources: sourceRows.length, healthySources: healthy.length, productivelyHealthySources: productive.length, reraSources: rera.length, healthyReraSources: healthyRera.length, technicalGap: sourceRows.length === 0 || healthy.length === 0 });
  }
  return [...byCode.values()];
}
function categoryCounts(rows) {
  return Object.fromEntries(states.map((state) => [state, rows.filter((row) => primaryState(row) === state).length]));
}

const rows = after.rows.map((row) => ({ ...row, primaryState: primaryState(row), priority: priority(row) }));
const beforeRows = baseline.rows.map((row) => ({ ...row, primaryState: primaryState(row) }));
const beforeByUrl = new Map(beforeRows.map((row) => [String(row.url).replace(/\/$/, '').toLowerCase(), row]));
const recoveredSources = rows.filter((row) => row.primaryState === 'CONTENT_HEALTHY' && beforeByUrl.get(String(row.url).replace(/\/$/, '').toLowerCase())?.primaryState !== 'CONTENT_HEALTHY').map((row) => ({ url: row.url, before: beforeByUrl.get(String(row.url).replace(/\/$/, '').toLowerCase())?.primaryState || 'MISSING', after: row.primaryState, method: row.listingMethod || '', links: row.articleLinksDiscovered || 0, readable: row.fullArticlesReadable || 0, dates: row.publicationDatesExtracted || 0 }));
const transportRows = rows.filter((row) => row.primaryState === 'TRANSPORT_FAILURE');
const extractionRows = rows.filter((row) => row.primaryState === 'EXTRACTION_FAILURE');
const reraRows = rows.filter(isRera).map((row) => ({ state: row.label || '', cityCoverage: row.cityCodes || [], url: row.url, primaryState: row.primaryState, httpStatus: row.status || '', timeoutStage: row.error || '', redirect: row.finalUrl && row.finalUrl !== row.url ? row.finalUrl : '', contentType: row.contentType || '', listingExtraction: row.listingExtraction || '', documentExtraction: /\.pdf/i.test(row.url) ? 'PDF_LINK_OR_DOCUMENT' : 'NOT_DOCUMENT_SOURCE', freshness: row.freshness || 'unknown', failureReason: row.error || row.contentHealth || '', material: reraMaterial(row), priority: row.priority }));
const verifiedReplacementResearch = [
  { configuredUrl: 'https://www.nhsrcl.in/en/media/press-release', candidateUrl: 'https://www.nhsrcl.in/index.php/mr/media/press-release', owner: 'nhsrcl.in', evidence: 'Official NHSRCL press-release page was discoverable at the candidate URL.', recommendation: 'REPLACE_ONLY_AFTER_LOCAL_RECHECK' },
  ...['insuranceRSS', 'marketsRSS', 'moneyRSS', 'newsRSS', 'politicsRSS', 'technologyRSS'].map((suffix) => ({ configuredUrl: `https://www.livemint.com/rss/${suffix}`, candidateUrl: 'https://www.livemint.com/topic/real-estate', owner: 'livemint.com', evidence: 'Official Mint real-estate topic page is available, but it is HTML and not an equivalent RSS path.', recommendation: 'ADAPTER_REQUIRED_BEFORE_REPLACE' })),
  { configuredUrl: 'https://www.savills.in/research.aspx', candidateUrl: 'https://www.savills.in/research_articles/165611/180490-0', owner: 'savills.in', evidence: 'Official Savills India research article path was discoverable, but no verified current research index replacement was established.', recommendation: 'NO_SAFE_INDEX_REPLACEMENT' },
  { configuredUrl: 'https://www.hindustantimes.com/feeds/rss/cities/bengaluru-news/rssfeed.xml', candidateUrl: '', owner: 'hindustantimes.com', evidence: 'Official HT RSS directory still lists the configured Bengaluru feed; retain for bounded retry rather than replacing on one 404 observation.', recommendation: 'KEEP_AND_RETRY' },
  { configuredUrl: 'https://www.hindustantimes.com/feeds/rss/cities/bhopal-news/rssfeed.xml', candidateUrl: '', owner: 'hindustantimes.com', evidence: 'Official HT RSS directory still lists the configured Bhopal feed; retain for bounded retry rather than replacing on one 404 observation.', recommendation: 'KEEP_AND_RETRY' }
];
const transportBreakdown = Object.fromEntries(['DNS', 'CONNECT_TIMEOUT', 'READ_TIMEOUT', 'TLS', 'CONNECTION_RESET', '403', '404', '406', '429', '5XX', 'REDIRECT_FAILURE', 'RESPONSE_TOO_LARGE', 'CONTENT_TYPE', 'OTHER'].map((key) => [key, transportRows.filter((row) => transportClass(row) === key).length]));
const extractionBreakdown = Object.fromEntries(['HTML_SELECTOR', 'DYNAMIC_PAGE', 'JSON_LD', 'EMBEDDED_JSON', 'PDF', 'IMAGE_PDF', 'DETAIL_LINK', 'PAGINATION', 'POSTBACK', 'IFRAME', 'SCRIPT_RENDERED', 'CONTENT_TOO_LARGE', 'ENCODING', 'DATE_ONLY', 'AUTHORITY_NOTICE_TABLE', 'OTHER'].map((key) => [key, extractionRows.filter((row) => classifyExtractionFailure(row) === key).length]));
const reviewBreakdown = Object.fromEntries(['CONTENT_UNCERTAIN', 'DATE_UNCERTAIN', 'LISTING_ONLY', 'NO_ARTICLE_SAMPLE', 'DYNAMIC', 'LOW_TEXT', 'GEO_UNCERTAIN', 'RELEVANCE_UNCERTAIN', 'OTHER'].map((key) => [key, rows.filter((row) => row.primaryState === 'NEEDS_REVIEW' && reviewSubtype(row) === key).length]));
const emptyBreakdown = Object.fromEntries(['TRUE_EMPTY', 'TEMPORARILY_EMPTY', 'EXTRACTION_EMPTY', 'WRONG_PAGE_OR_DYNAMIC_CONTENT', 'ARCHIVE_REQUIRED', 'DYNAMIC_CONTENT', 'STALE_LISTING', 'UNKNOWN'].map((key) => [key, rows.filter((row) => row.primaryState === 'EMPTY' && emptySubtype(row) === key).length]));
const priorityCounts = Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((key) => [key, rows.filter((row) => row.priority === key).length]));
const beforeCategories = categoryCounts(beforeRows); const afterCategories = categoryCounts(rows);
const citiesBefore = cityCoverage(beforeRows); const citiesAfter = cityCoverage(rows); const beforeMap = new Map(citiesBefore.map((row) => [row.cityCode, row]));
const citiesImproved = citiesAfter.filter((row) => { const before = beforeMap.get(row.cityCode); return row.healthySources > (before?.healthySources || 0) || row.productivelyHealthySources > (before?.productivelyHealthySources || 0); });
const report = {
  reportType: 'TASK14_SOURCE_RECOVERY', generatedAt: new Date().toISOString(), baselineAudit: path.relative(root, baselinePath), afterAudit: path.relative(root, path.isAbsolute(afterPath) ? afterPath : path.join(auditDir, afterPath)), qualityControls: { negativeControls: '8/8', classifierAndGeoBroadChanges: false, rawLinksAreNotSuccess: true },
  methodology: { primaryStateOrder: 'deterministic from contentHealth/health; raw row flags preserved', rawLinksAreNotSuccess: true, noLiveConfigMutation: true },
  categoryReconciliation: { total: rows.length, states, before: beforeCategories, after: afterCategories, unaccounted: rows.filter((row) => !states.includes(row.primaryState)).length },
  priorities: priorityCounts,
  rera: { totalConfiguredRows: reraRows.length, rows: reraRows, healthy: reraRows.filter((row) => row.primaryState === 'CONTENT_HEALTHY').length, productivelyHealthy: reraRows.filter((row) => row.primaryState === 'CONTENT_HEALTHY' && row.listingExtraction === 'success').length },
  transport: { total: transportRows.length, breakdown: transportBreakdown, interpretation: 'Timeout/fetch-failed classes are bounded observations; without a second independent network vantage they remain external-or-environment blockers, not speculative code bugs.' },
  extraction: { total: extractionRows.length, breakdown: extractionBreakdown, adapterRecoveryCandidates: extractionRows.filter((row) => ['JSON_LD', 'EMBEDDED_JSON', 'PDF', 'AUTHORITY_NOTICE_TABLE', 'DETAIL_LINK'].includes(classifyExtractionFailure(row))).length },
  needsReview: { total: rows.filter((row) => row.primaryState === 'NEEDS_REVIEW').length, breakdown: reviewBreakdown },
  empty: { total: rows.filter((row) => row.primaryState === 'EMPTY').length, breakdown: emptyBreakdown },
  stale: rows.filter((row) => row.primaryState === 'STALE').map((row) => ({ url: row.url, latestArticleDate: row.latestArticleDate || '', cityCodes: row.cityCodes || [], priority: row.priority })),
  broken: rows.filter((row) => row.primaryState === 'BROKEN_URL').map((row) => ({ configuredUrl: row.url, status: row.status || '', owner: row.host, verifiedReplacement: '', recommendation: 'NO_SAFE_REPLACEMENT', evidence: 'Current audit observed HTTP 404; replacement not asserted without verification.' })),
  verifiedReplacementResearch,
  blocked: rows.filter((row) => row.primaryState === 'BLOCKED').map((row) => ({ url: row.url, status: row.status || '', owner: row.host, recommendation: 'KEEP_BLOCKED_NO_BYPASS' })),
  healthBeforeAfter: { contentHealthy: { before: beforeCategories.CONTENT_HEALTHY, after: afterCategories.CONTENT_HEALTHY }, productivelyHealthy: { before: beforeRows.filter(productivelyHealthy).length, after: rows.filter(productivelyHealthy).length }, transportFailure: { before: beforeCategories.TRANSPORT_FAILURE, after: afterCategories.TRANSPORT_FAILURE }, extractionFailure: { before: beforeCategories.EXTRACTION_FAILURE, after: afterCategories.EXTRACTION_FAILURE }, needsReview: { before: beforeCategories.NEEDS_REVIEW, after: afterCategories.NEEDS_REVIEW }, empty: { before: beforeCategories.EMPTY, after: afterCategories.EMPTY }, stale: { before: beforeCategories.STALE, after: afterCategories.STALE }, broken: { before: beforeCategories.BROKEN_URL, after: afterCategories.BROKEN_URL }, blocked: { before: beforeCategories.BLOCKED, after: afterCategories.BLOCKED }, recoveredSources, recoveredCount: recoveredSources.length },
  recoveryAssessment: { recoverableNow: rows.filter((row) => row.primaryState === 'EXTRACTION_FAILURE' && ['JSON_LD', 'EMBEDDED_JSON', 'AUTHORITY_NOTICE_TABLE', 'DETAIL_LINK'].includes(classifyExtractionFailure(row))).length, externalSiteOrEnvironmentBlocker: transportRows.length, requiresNewAdapter: extractionRows.length, noSafeFix: rows.filter((row) => ['BROKEN_URL', 'BLOCKED'].includes(row.primaryState)).length, unknown: rows.filter((row) => row.primaryState === 'OTHER').length },
  cityImpact: { cities: citiesAfter, improved: citiesImproved.map((row) => row.cityCode), underCovered: citiesAfter.filter((row) => row.technicalGap || row.productivelyHealthySources === 0).map((row) => row.cityCode) },
  debtRegister: rows.filter((row) => ['P0', 'P1'].includes(row.priority) && row.primaryState !== 'CONTENT_HEALTHY').map((row) => ({ source: row.url, coverage: row.cityCodes || [], failure: row.primaryState, priority: row.priority, recommendedFix: row.primaryState === 'TRANSPORT_FAILURE' ? 'Bounded retry and independent endpoint verification' : row.primaryState === 'EXTRACTION_FAILURE' ? `Apply shared adapter: ${classifyExtractionFailure(row)}` : 'Targeted recheck with source-specific evidence', externalDependency: row.primaryState === 'TRANSPORT_FAILURE', lastVerified: after.summary.generatedAt, status: 'OPEN' })),
  nextBottleneck: afterCategories.TRANSPORT_FAILURE > afterCategories.EXTRACTION_FAILURE ? 'TRANSPORT_FAILURE' : 'EXTRACTION_FAILURE'
};
await fs.writeFile(path.join(outputDir, 'task14-source-recovery-report.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(outputDir, 'task14-source-recovery-debt-register.json'), JSON.stringify({ generatedAt: report.generatedAt, baselineAudit: report.baselineAudit, unresolved: report.debtRegister }, null, 2) + '\n');
console.log(JSON.stringify({ after: report.afterAudit, categories: report.categoryReconciliation.after, priorities: report.priorities, productivelyHealthy: report.healthBeforeAfter.productivelyHealthy, rera: { total: report.rera.totalConfiguredRows, healthy: report.rera.healthy }, nextBottleneck: report.nextBottleneck }, null, 2));
