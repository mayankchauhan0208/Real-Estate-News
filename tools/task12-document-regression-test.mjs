import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd(); const report = JSON.parse(await fs.readFile(path.join(root, 'reports/source-audits/task12/task12-document-recovery-report.json'), 'utf8'));
assert.equal(report.baseline.configuredSources, 571); assert.equal(report.baseline.cities, 234); assert.equal(report.baseline.duplicateSourceRows, 0); assert.equal(report.baseline.negativeProtection, '8/8'); assert.ok(report.stages.RAW_LINKS > report.stages.DOCUMENT_LINKS); assert.ok(report.validDocumentsRecoveredAutomatically >= 0); assert.equal(report.sources['UP RERA'].status, 'BLOCKED_BY_PUBLIC_SITE_BEHAVIOR');
console.log(JSON.stringify({ passed: true, validDocumentsRecoveredAutomatically: report.validDocumentsRecoveredAutomatically, readableDocuments: report.stages.READABLE_DOCUMENTS, nextBottleneck: report.nextBottleneck }, null, 2));
