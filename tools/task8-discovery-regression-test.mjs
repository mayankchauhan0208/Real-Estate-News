import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'tools', 'fixtures', 'task8');
const up = await fs.readFile(path.join(dir, 'up-rera-listing.html'), 'utf8');
const dda = await fs.readFile(path.join(dir, 'dda-listing.html'), 'utf8');
const goa = await fs.readFile(path.join(dir, 'goa-listing.html'), 'utf8');
const pdf = await fs.readFile(path.join(dir, 'sample-document.pdf'));

assert.match(up, /__doPostBack\(/);
assert.match(up, /UP RERA Approves 13 Real Estate Projects/);
assert.match(dda, /karmayogi_circular\.pdf/);
assert.match(goa, /viewProjectDetailPage/);
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
assert.ok(['POSTBACK_DOCUMENT', 'PDF', 'PROJECT_DETAIL'].length === 3);
console.log('Task 8 discovery fixtures passed.');
