import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const report = JSON.parse(await fs.readFile(path.join(root, 'reports/source-audits/task10/task10-discovery-recovery-report.json'), 'utf8'));
assert.equal(report.before.automaticDiscovery, '0/8');
assert.match(report.after.automaticDiscovery, /^([0-8])\/8$/);
assert.equal(report.remainingControlReasons.length, 8 - report.after.recoveredIds.length);
assert.equal(report.limits.maxDepth, 2);
assert.equal(report.limits.maxBytes, 4 * 1024 * 1024);
assert.equal(report.upRera.status, 'CURRENTLY_UNRECOVERABLE_SAFE');
assert.equal(report.upRera.failure, 'MAINTENANCE');
assert.equal(report.negativeControlRegression.falsePositive, 'SIBM Pune MBA');
console.log(JSON.stringify({
  passed: true,
  automaticDiscovery: report.after.automaticDiscovery,
  recoveredIds: report.after.recoveredIds,
  remainingReasons: report.remainingControlReasons.length,
}, null, 2));
