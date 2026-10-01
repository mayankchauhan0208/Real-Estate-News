import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const report = JSON.parse(await fs.readFile('reports/source-audits/task14-source-recovery/task14-source-recovery-report.json', 'utf8'));
const after = report.categoryReconciliation.after;
assert.equal(report.categoryReconciliation.total, 571);
assert.equal(report.categoryReconciliation.unaccounted, 0);
assert.equal(after.CONTENT_HEALTHY, 74);
assert.equal(report.healthBeforeAfter.contentHealthy.before, 35);
assert.ok(report.healthBeforeAfter.contentHealthy.after > report.healthBeforeAfter.contentHealthy.before);
assert.equal(report.healthBeforeAfter.recoveredCount, 43);
assert.equal(report.healthBeforeAfter.productivelyHealthy.after, 9);
assert.equal(report.rera.totalConfiguredRows, 44);
assert.equal(report.rera.productivelyHealthy, 0);
assert.equal(report.qualityControls.negativeControls, '8/8');
assert.equal(report.qualityControls.classifierAndGeoBroadChanges, false);
assert.equal(report.afterAudit.includes('source-audit-2026-09-30T12-58-19-897Z.json'), true);
console.log(JSON.stringify({ passed: true, total: report.categoryReconciliation.total, contentHealthy: after.CONTENT_HEALTHY, recovered: report.healthBeforeAfter.recoveredCount, productive: report.healthBeforeAfter.productivelyHealthy.after, rera: report.rera.totalConfiguredRows }));
