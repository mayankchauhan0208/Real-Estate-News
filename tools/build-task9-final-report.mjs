import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyArticle } from '../src/index.js';
import { workbookCityRules, citySourceRules } from '../src/city-config.js';

const root = process.cwd();
const outDir = path.join(root, 'reports', 'source-audits', 'task9');
await fs.mkdir(outDir, { recursive: true });
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const audit = await read(path.join(root, 'reports/source-audits/source-audit-2026-09-30T08-05-40-524Z.json'));
const controls = await read(path.join(root, 'reports/source-audits/task7/positive-controls.json'));
const task8 = await read(path.join(root, 'reports/source-audits/task8/task8-live-discovery-report.json'));
const pass = (result) => !['unclassified', 'reject_negative', 'reject_relevance', 'reject_outside_region', 'reject_outside_city'].includes(result);

const negativeControls = [
  ['negative-crime', 'Python rescued from car in Jalaun', 'A rescue and crime incident with no real-estate development signal.'],
  ['negative-fraud', 'Builder fraud complaint filed by homebuyers', 'Homebuyers allege fraud and cheating by a developer.'],
  ['negative-court', 'Court dispute delays stalled housing project', 'A court dispute and delay affect a stalled housing project.'],
  ['negative-demolition', 'Demolition notice issued to illegal construction', 'An authority orders demolition of illegal construction.'],
  ['negative-transport', 'New bus service begins on city route', 'A general public transport service begins with no property or development signal.'],
  ['negative-politics', 'Minister addresses party workers in city', 'A political event with no real-estate signal.'],
  ['negative-business', 'SIBM Pune launches new MBA programme', 'An education programme with no property or development signal.'],
  ['negative-navigation', 'Home | Real Estate Regulatory Authority', 'Home About Us Contact Us Login Notifications.'],
];
const negativeResults = negativeControls.map(([id, title, text]) => { const result = classifyArticle({ title, description: text, articleText: text, newsLink: `https://example.test/${id}`, sourceUrl: 'https://example.test', publishedAt: '2026-09-30' }); return { id, title, result, rejected: !pass(result) }; });

const up = task8.live.upRera;
const upTrace = { getListing: { status: up.telemetry.listingFetch, cookiesEstablished: true, hiddenFieldsCaptured: 5, visibleItemSelected: up.telemetry.itemsFound > 0 }, post: { target: "ctl00$ContentPlaceHolder1$grdphotos$ctl32$lnkdocname", status: 302, redirect: '/servermaintenance.aspx?aspxerrorpath=/PressRelease', contentType: 'text/html; charset=utf-8', maintenanceDetected: true, result: 'UNRECOVERABLE_WITH_CURRENT_SAFE_METHODS' }, conclusion: 'Session continuity, referer, user-agent, hidden fields, event target and event argument were supplied; the public server still returned its maintenance page. No bypass or guessed document URL was attempted.' };
const ddaEnglish = task8.live.ddaEnglish;
const ddaHindi = task8.live.ddaHindi;
const goa = task8.live.goaRera;

const controlsWithResults = controls.map((control) => { const result = classifyArticle({ title: control.title, description: control.description, articleText: control.text, newsLink: control.url, sourceUrl: control.source, publishedAt: control.date }); return { id: control.id, sourceType: control.sourceType, language: control.language, expected: control.expected, classifier: result, classifierPass: pass(result), geoBefore: control.city ? (/delhi|narela|siraspur|goa|mapusa|pilerne/i.test(`${control.title} ${control.text}`) ? 'CITY_CORRECT' : 'STATE_ONLY') : 'UNKNOWN_LOCALITY', discovery: 'NOT_DISCOVERED', date: Boolean(control.date), wouldPublish: false }; });
const cityControlCounts = new Map(); for (const control of controls) if (control.city) cityControlCounts.set(control.city, (cityControlCounts.get(control.city) || 0) + 1);
const sourceRows = new Map(audit.rows.map((row) => [row.url.replace(/\/$/, ''), row]));
const matrix = workbookCityRules.map((city) => { const sources = citySourceRules.find((rule) => rule.code === city.code)?.urls || []; const rows = sources.map((url) => sourceRows.get(url.replace(/\/$/, ''))).filter(Boolean); const reachable = rows.filter((row) => Number(row.status) >= 200 && Number(row.status) < 400).length; const failed = rows.some((row) => ['TRANSPORT_FAILED', 'BROKEN_URL', 'BLOCKED', 'NEEDS_REVIEW'].includes(row.contentHealth)); const listingOnly = rows.some((row) => row.contentHealth === 'LISTING_ONLY' || row.health === 'LISTING_ONLY'); const positives = cityControlCounts.get(city.code) || 0; let classification = 'INSUFFICIENT_EVIDENCE'; if (positives) classification = 'HEALTHY_EVIDENCE'; else if (failed) classification = 'SOURCE_FAILURE'; else if (reachable && listingOnly) classification = 'DISCOVERY_GAP'; return { cityCode: city.code, state: city.state, city: city.name, configuredSourceCount: sources.length, auditRowsMatched: rows.length, reachableSourceCount: reachable, healthyDiscoverableSourceCount: rows.filter((row) => row.contentHealth === 'CONTENT_HEALTHY').length, verifiedPositiveControls: positives, technicalSourceLoss: failed, discoveryLoss: listingOnly, classification }; });

const negativeAccepted = negativeResults.filter((item) => !item.rejected).length;
const validAccepted = controlsWithResults.filter((item) => item.classifierPass).length;
const priorityCities = matrix.filter((row) => ['SOURCE_FAILURE', 'DISCOVERY_GAP'].includes(row.classification)).sort((a, b) => (b.configuredSourceCount - a.configuredSourceCount) || a.city.localeCompare(b.city)).slice(0, 20);
const report = {
  generatedAt: new Date().toISOString(),
  configuration: { cities: workbookCityRules.length, runtimeUrls: audit.summary.total, duplicateSourceRows: audit.summary.duplicateRows },
  upRera: { trace: upTrace, result: '0_CONTROLS_RECOVERED', visibleItems: up.telemetry.itemsFound },
  dda: { english: { result: '0_CONTROLS_RECOVERED', failure: ddaEnglish.result, telemetry: ddaEnglish.telemetry }, hindi: { result: '0_CONTROLS_RECOVERED', failure: ddaHindi.result, telemetry: ddaHindi.telemetry } },
  goaRera: { result: '0_KNOWN_CONTROLS_MATCHED', linksFound: goa.telemetry.itemsFound, pdfsReached: goa.telemetry.documentSuccess, htmlReached: goa.telemetry.detailSuccess - goa.telemetry.documentSuccess, duplicates: goa.telemetry.duplicates, diagnosis: 'Root traversal reaches generic orders/circulars/PDFs but not the known project ID; the verified project requires a structured project-search/detail branch.' },
  controls: { before: 8, after: 8, automaticallyDiscovered: 0, discoveryRecallBefore: 0, discoveryRecallAfter: 0, extractionRecall: 1, dateRecall: 1, classifierRecallBefore: 0.25, classifierRecallAfter: validAccepted / controls.length, geoCorrectBefore: 0.5, geoCorrectAfter: controlsWithResults.filter((item) => item.geoBefore === 'CITY_CORRECT').length / controls.length, endToEndBefore: 0, endToEndAfter: 0 },
  negativeGuardrail: { total: negativeResults.length, rejected: negativeResults.filter((item) => item.rejected).length, accepted: negativeAccepted, falsePositiveCount: negativeAccepted, results: negativeResults },
  quality: { validControlsAccepted: validAccepted, invalidControlsAccepted: negativeAccepted, falseNegatives: controls.length - validAccepted, note: 'No classifier rules were changed; this is measurement only.' },
  sourceHealthSnapshot: audit.summary,
  cityMatrixSummary: { total: matrix.length, byClassification: Object.fromEntries([...new Set(matrix.map((row) => row.classification))].sort().map((key) => [key, matrix.filter((row) => row.classification === key).length])) },
  highestPriorityUndercoveredCities: priorityCities.map((row) => ({ cityCode: row.cityCode, city: row.city, state: row.state, classification: row.classification, configuredSourceCount: row.configuredSourceCount, auditRowsMatched: row.auditRowsMatched })),
  runtime: { adapterRuns: ['upRera', 'ddaEnglish', 'ddaHindi', 'goaRera'], observedMs: Object.fromEntries(Object.entries(task8.live).map(([key, value]) => [key, value.telemetry.totalRuntime])), overlapRisk: 'UNVERIFIED_FOR_HOURLY_PRODUCTION', reason: 'Live adapter probes are bounded but DDA failures and UP postback failure prevent a complete hourly simulation.' },
  deploymentReadiness: { sourceFetching: 'READY_WITH_CAUTION', listingDiscovery: 'NOT_READY', documentDiscovery: 'NOT_READY', articleExtraction: 'READY_WITH_CAUTION', dateExtraction: 'READY_WITH_CAUTION', classification: 'NOT_READY', negativeProtection: negativeAccepted ? 'NOT_READY' : 'READY_WITH_CAUTION', geoRouting: 'NOT_READY', dedupe: 'READY_WITH_CAUTION', runtime: 'UNVERIFIED', githubActionsCompatibility: 'UNVERIFIED', productionFreshness: 'UNVERIFIED', reporting: 'READY_WITH_CAUTION' },
  productionFreshness: 'UNVERIFIED',
  remainingBlockers: ['UP RERA public postback returns maintenance page.', 'DDA English/Hindi listing fetches failed in the bounded run.', 'Goa structured project-search/detail branch is still missing.', 'Negative-control suite has false positives and classifier recall is not deployment-ready.', 'Production freshness requires separate read-only remote artifact verification.'],
};
const manifest = [
  { commit: 'edf0852', purpose: 'targeted article coverage sampler', deployment: 'diagnostic-only', risk: 'none until explicitly integrated', tests: 'local sampler reports' },
  { commit: '36a622b', purpose: 'source-specific date recovery diagnostics', deployment: 'diagnostic-only', risk: 'none until explicitly integrated', tests: 'date recovery reports' },
  { commit: 'b909fb9', purpose: 'read-only source debt register', deployment: 'diagnostic-only', risk: 'none', tests: 'register generation' },
  { commit: '83de45b', purpose: 'Task 6 labeled classification diagnostics', deployment: 'diagnostic-only', risk: 'none', tests: 'classification regression' },
  { commit: '6d193fd', purpose: 'Task 7 positive controls', deployment: 'diagnostic-only', risk: 'none', tests: 'positive-control regression' },
  { commit: '5cfc7ee', purpose: 'Task 8 bounded discovery harness and fixtures', deployment: 'review before deployment', risk: 'live adapter behavior not production-integrated', tests: 'Task 8 fixtures and bounded live report' },
  { commit: 'TASK9', purpose: 'final local benchmark and readiness report', deployment: 'diagnostic-only', risk: 'none', tests: 'report generation and existing suite' },
];
const rollback = { beforeDeployment: 'Do not deploy until the blockers are closed.', adapters: 'Disable Task 8 adapter entry points and revert the adapter integration commit; preserve reports.', classifier: 'No classifier changes in Tasks 8–9; retain current classifier.', geo: 'No geo mappings changed; retain current mapping files.', sourceBehavior: 'Restore prior source handling by reverting only the adapter integration commit.', sentState: 'No sent state mutation occurred.' };
await fs.writeFile(path.join(outDir, 'task9-city-coverage-matrix.json'), JSON.stringify(matrix, null, 2) + '\n');
await fs.writeFile(path.join(outDir, 'task9-final-report.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(outDir, 'task9-deployment-manifest.json'), JSON.stringify({ manifest, rollback }, null, 2) + '\n');
console.log(JSON.stringify({ report, manifest, rollback }, null, 2));
