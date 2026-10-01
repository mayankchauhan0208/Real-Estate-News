import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const fixtures = path.join(root, 'tools', 'fixtures', 'task8');
const report = JSON.parse(await fs.readFile(path.join(root, 'reports', 'source-audits', 'task8', 'task8-live-discovery-report.json'), 'utf8'));
assert.match(await fs.readFile(path.join(fixtures, 'up-rera-listing.html'), 'utf8'), /__doPostBack/);
assert.match(await fs.readFile(path.join(fixtures, 'dda-listing.html'), 'utf8'), /\.pdf/);
assert.match(await fs.readFile(path.join(fixtures, 'goa-listing.html'), 'utf8'), /viewProjectDetailPage/);
assert.equal((await fs.readFile(path.join(fixtures, 'sample-document.pdf'))).subarray(0, 5).toString(), '%PDF-');
assert.equal(report.limits.maxDepth, 2);
assert.ok(report.limits.maxPostbacks <= 8);
assert.equal(report.duplicateCanonicalRecords, 0);
console.log('Task 8 adapter regression fixtures passed.');
