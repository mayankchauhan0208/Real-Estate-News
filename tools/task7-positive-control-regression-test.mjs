import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const controls = JSON.parse(await fs.readFile(path.join(root, 'reports', 'source-audits', 'task7', 'positive-controls.json'), 'utf8'));
const report = JSON.parse(await fs.readFile(path.join(root, 'reports', 'source-audits', 'task7', 'task7-positive-control-report.json'), 'utf8'));

assert.equal(controls.length, 8);
assert.equal(new Set(controls.map((item) => item.id)).size, controls.length);
assert.equal(controls.filter((item) => item.sourceType === 'RERA').length, 4);
assert.equal(controls.filter((item) => item.sourceType === 'REGIONAL').length, 2);
assert.ok(controls.every((item) => item.expected && item.evidence && item.listingUrl));
assert.equal(report.sourceUnavailableAmongControls, 0);
assert.equal(report.adaptersImplemented.length, 0);
console.log('Task 7 positive-control regression fixtures passed.');
