import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd(); const report = JSON.parse(await fs.readFile(path.join(root, 'reports/source-audits/task14/task14-tesseract-recovery-report.json'), 'utf8'));
assert.equal(report.environment.languages.includes('eng'), true); assert.equal(report.environment.languages.includes('hin'), true); assert.equal(report.hsvp.pdfsTested, 4); assert.equal(report.hsvp.validRecords, 2); assert.equal(report.hsvp.publishableRecords, 0); assert.equal(report.automaticRecovery.after, 2); assert.equal(report.negativeBenchmark, '8/8'); assert.equal(report.cache.duplicateOcrExecution, 0); assert.equal(report.limits.maxConcurrent, 1);
console.log(JSON.stringify({ passed: true, tesseract: report.environment.tesseract, languages: report.environment.languages, pdfsTested: report.hsvp.pdfsTested, validRecords: report.hsvp.validRecords, englishChars: report.hsvp.english.chars, hindiChars: report.hsvp.hindi.chars }, null, 2));
