import fs from 'node:fs/promises';

const report = JSON.parse(await fs.readFile('reports/source-audits/task15/task15-content-yield-report.json', 'utf8'));
const items = (await fs.readFile('reports/source-audits/task15/task15-items.jsonl', 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const sample = JSON.parse(await fs.readFile('reports/source-audits/task15/task15-manual-validation-sample.json', 'utf8'));
const allowed = new Set(['WOULD_PUBLISH', 'NAVIGATION', 'UNREADABLE', 'NO_DATE', 'STALE', 'NO_REAL_ESTATE_SIGNAL', 'NO_PROJECT_DEVELOPMENT_SIGNAL', 'NEGATIVE', 'OFF_TOPIC', 'NO_GEO', 'AMBIGUOUS_GEO', 'OUTSIDE_SUPPORTED_CITY', 'DUPLICATE', 'QUALITY', 'OCR_REQUIRED', 'OTHER']);

if (report.frozenBaseline.sources !== 571 || report.frozenBaseline.cities !== 234 || report.frozenBaseline.duplicateSourceRows !== 0) throw new Error('frozen baseline drifted');
if (report.cohorts.cohortA.size !== 74 || report.cohorts.cohortB.size !== 48) throw new Error('cohort sizes drifted');
if (report.benchmarkWindow.start !== '2026-09-24T00:00:00.000Z' || report.benchmarkWindow.end !== '2026-10-01T23:59:59.999Z') throw new Error('benchmark window drifted');
if (report.counters.SOURCES_ATTEMPTED !== 122 || items.length !== 227) throw new Error('benchmark item count mismatch');
if (report.counters.WOULD_PUBLISH !== 0 || report.wouldPublishItems.length !== 0) throw new Error('strict geo quality gate changed');
if (report.negativeProtection.existingControls !== '8/8') throw new Error('negative controls regressed');
if (report.positiveCorpus.before !== 8 || report.positiveCorpus.after !== 8) throw new Error('unverified positives entered corpus');
if (!items.every((item) => allowed.has(item.finalReason))) throw new Error('unknown item final reason');
const sampledItems = [...(sample.accepted || []), ...(sample.rejected || []), ...(sample.review || [])];
if (sampledItems.some((item) => item.manualLabel !== 'UNCERTAIN')) throw new Error('unverified manual labels present');
if (!Array.isArray(report.cityYield) || report.cityYield.length !== 234) throw new Error('city yield is incomplete');
if (report.dedupe.canonicalDuplicates < 0 || report.dedupe.titleNearDuplicates < 0) throw new Error('invalid dedupe counters');

console.log(JSON.stringify({
  passed: true,
  cohortA: report.cohorts.cohortA.size,
  cohortB: report.cohorts.cohortB.size,
  items: items.length,
  wouldPublish: report.counters.WOULD_PUBLISH,
  negativeControls: report.negativeProtection.existingControls,
  cityRows: report.cityYield.length,
  humanVerifiedPositives: 0
}));
