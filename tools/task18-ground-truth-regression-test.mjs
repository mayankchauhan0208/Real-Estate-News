import fs from 'node:fs/promises';

const report = JSON.parse(await fs.readFile('reports/source-audits/task18/task18-ground-truth-analysis.json', 'utf8'));
const traces = JSON.parse(await fs.readFile('reports/source-audits/task18/task18-publish-traces.json', 'utf8'));
const loss = JSON.parse(await fs.readFile('reports/source-audits/task18/task18-loss-attribution.json', 'utf8'));
const sourceYield = JSON.parse(await fs.readFile('reports/source-audits/task18/task18-source-yield.json', 'utf8'));
const requiredFiles = [
  'reports/source-audits/task18/task18-record-analysis.csv',
  'reports/source-audits/task18/task18-publish-traces.json',
  'reports/source-audits/task18/task18-loss-attribution.json',
  'reports/source-audits/task18/task18-source-yield.json'
];

for (const file of requiredFiles) await fs.access(file);
if (report.validation.total !== 69) throw new Error('audited record count mismatch');
if (JSON.stringify(report.validation.labelCounts) !== JSON.stringify({ PUBLISH: 2, REJECT_NEGATIVE: 15, REJECT_OFF_TOPIC: 29, REJECT_INSUFFICIENT: 23, REVIEW_UNCERTAIN: 0 })) throw new Error('audited label totals mismatch');
if (!report.validation.supportedPublishCities || report.validation.publishCities.length !== 2) throw new Error('publish city validation failed');
if (report.confusionMatrix.TP !== 0 || report.confusionMatrix.FP !== 0 || report.confusionMatrix.TN !== 67 || report.confusionMatrix.FN !== 2 || report.confusionMatrix.unresolved !== 0) throw new Error('confusion matrix drifted');
if (report.negativeAnalysis.total !== 15 || report.negativeAnalysis.protectedCorrectly !== 15 || report.negativeAnalysis.wouldPublish !== 0) throw new Error('negative protection drifted');
if (report.offTopicAnalysis.total !== 29 || report.insufficientAnalysis.total !== 23) throw new Error('editorial category totals drifted');
if (report.extractionQuality.JAVASCRIPT_CONTAMINATED.publishAffected !== 2) throw new Error('publish extraction contamination not preserved');
const traceById = Object.fromEntries(traces.map((trace) => [trace.recordId, trace]));
if (traceById['task17-001']?.firstLoss?.primary !== 'GEO') throw new Error('DDA first-loss stage changed');
if (traceById['task17-059']?.firstLoss?.primary !== 'EXTRACTION') throw new Error('YEIDA first-loss stage changed');
if (loss.editorialFalseNegativeLoss.length !== 2) throw new Error('publish loss attribution incomplete');
if (sourceYield.sources.length < 1) throw new Error('source yield report empty');
if (report.negativeControls !== '8/8' || report.configuration.cities !== 234 || report.configuration.runtimeUrls !== 571 || report.configuration.duplicateSourceRows !== 0) throw new Error('safety controls drifted');

console.log(JSON.stringify({
  passed: true,
  labels: report.validation.labelCounts,
  confusionMatrix: report.confusionMatrix,
  publishLosses: report.publishTraces.map((trace) => ({ recordId: trace.recordId, firstLoss: trace.firstLoss.primary })),
  jsContaminatedPublishRecords: report.extractionQuality.JAVASCRIPT_CONTAMINATED.publishAffected,
  negativeProtected: report.negativeAnalysis.protectedCorrectly,
  sources: sourceYield.sources.length
}));
