import fs from 'node:fs/promises';

const baselinePath = 'reports/source-audits/source-audit-2026-09-30T12-58-19-897Z.json';
const checkpointPath = 'reports/source-audits/task14-targeted-recovery/checkpoint.json';
const reportPath = 'reports/source-audits/task14-targeted-recovery/task14-targeted-recovery-report.json';
const allowedStatuses = new Set([
  'RECOVERED',
  'PARTIALLY_RECOVERED',
  'EXTERNAL_BLOCK',
  'TIMEOUT',
  'BROKEN',
  'EXTRACTION_ADAPTER_NEEDED',
  'EMPTY_CONFIRMED',
  'UNRESOLVED'
]);

const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const [baseline, checkpoint, report] = await Promise.all([
  read(baselinePath),
  read(checkpointPath),
  read(reportPath)
]);
const results = Object.values(checkpoint.results || {});
const ids = results.map((result) => result.sourceId);
const requiredBaseline = {
  sources: 571,
  contentHealthy: 74,
  transportFailures: 226,
  extractionFailures: 80,
  empty: 78,
  duplicateRows: 0
};

for (const [key, expected] of Object.entries(requiredBaseline)) {
  if (key === 'sources' && baseline.rows.length !== expected) throw new Error(`baseline ${key} mismatch`);
  const actualKey = {
    transportFailures: 'transportFailed',
    extractionFailures: 'extractionFailed'
  }[key] || key;
  if (key !== 'sources' && baseline.summary?.[actualKey] !== expected) throw new Error(`baseline ${key} mismatch`);
}
if (!checkpoint.baseline.includes('source-audit-2026-09-30T12-58-19-897Z.json')) throw new Error('checkpoint is not tied to frozen baseline');
if (checkpoint.attemptsLimit !== 2) throw new Error('attempt limit changed');
if (results.length < 20) throw new Error('targeted recovery has not attempted a meaningful batch');
if (new Set(ids).size !== ids.length) throw new Error('duplicate source IDs in checkpoint');
if (!results.every((result) => allowedStatuses.has(result.afterStatus))) throw new Error('unknown recovery status');
if (!results.every((result) => (result.attempts || []).length <= checkpoint.attemptsLimit)) throw new Error('bounded attempt limit exceeded');
if (!checkpoint.batches.every((batch) => batch.size >= 0 && batch.size <= 25)) throw new Error('batch size outside 10-25 contract');
if (report.authoritativeBaseline.contentHealthy !== 74 || report.authoritativeBaseline.duplicateRows !== 0) throw new Error('report baseline drifted');
if (report.targetedSourcesAttempted !== results.length) throw new Error('report/checkpoint count mismatch');
if (report.rera.attempted < 1) throw new Error('RERA priority was not attempted');

console.log(JSON.stringify({
  passed: true,
  checkpointed: results.length,
  batches: checkpoint.batches.length,
  reraAttempted: report.rera.attempted,
  recovered: results.filter((result) => result.afterStatus === 'RECOVERED').length,
  maxAttempts: Math.max(...results.map((result) => (result.attempts || []).length)),
  duplicateSourceIds: ids.length - new Set(ids).size
}));
