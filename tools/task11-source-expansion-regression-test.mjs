import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const report = JSON.parse(await fs.readFile(path.join(root, 'reports/source-audits/task11/task11-source-expansion-report.json'), 'utf8'));
assert.equal(report.baseline.sourceCount, 571);
assert.equal(report.baseline.duplicateSourceRows, 0);
assert.equal(report.coverageGaps.matrixTotal, 234);
assert.equal(report.candidatesInvestigated, 5);
assert.equal(report.negativeProtection.after, '8/8');
assert.equal(report.quality.productionFreshness, 'UNVERIFIED');
assert.equal(report.experimental.baselineSourceCount, 571);
assert.equal(report.experimental.sourceCount, 571 + report.candidatesPassingFullValidation);
assert.equal(report.brokenUrls.repairedLocally, 0);
console.log(JSON.stringify({ passed: true, passingCandidates: report.candidatesPassingFullValidation, additionalUniqueValidCandidates: report.experimental.uniqueValidCandidates, negativeProtection: report.negativeProtection.after }, null, 2));
