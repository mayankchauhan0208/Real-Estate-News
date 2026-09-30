import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'reports/source-audits/task9/task9-final-report.json');
const matrixPath = path.join(root, 'reports/source-audits/task9/task9-city-coverage-matrix.json');

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

assert.equal(report.configuration.cities, 234);
assert.equal(report.configuration.runtimeUrls, 571);
assert.equal(report.configuration.duplicateSourceRows, 0);
assert.equal(matrix.length, 234);
assert.equal(report.controls.automaticallyDiscovered, 0);
assert.equal(report.negativeGuardrail.total, 8);
assert.equal(report.productionFreshness, 'UNVERIFIED');
assert.equal(report.deploymentReadiness.listingDiscovery, 'NOT_READY');
assert.equal(report.deploymentReadiness.classification, 'NOT_READY');

console.log(JSON.stringify({
  passed: true,
  cityRows: matrix.length,
  automaticDiscoveryRecall: report.controls.discoveryRecallAfter,
  negativeControls: report.negativeGuardrail.total,
  falsePositives: report.negativeGuardrail.falsePositiveCount,
  productionFreshness: report.productionFreshness,
}, null, 2));
