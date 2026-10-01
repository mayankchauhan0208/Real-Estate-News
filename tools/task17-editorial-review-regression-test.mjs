import fs from 'node:fs/promises';

const csv = await fs.readFile('reports/source-audits/task17/editorial-review.csv', 'utf8');
const html = await fs.readFile('reports/source-audits/task17/editorial-review.html', 'utf8');
const report = JSON.parse(await fs.readFile('reports/source-audits/task17/task17-editorial-review-report.json', 'utf8'));
const lines = csv.trimEnd().split(/\r?\n/);
const header = lines[0].split(',');
const required = ['RECORD_ID', 'SOURCE', 'TITLE', 'URL', 'PUBLISHED_DATE', 'DESCRIPTION', 'EXTRACTED_TEXT_SNIPPET', 'CURRENT_RELEVANCE_RESULT', 'CURRENT_NEGATIVE_RESULT', 'CURRENT_GEO_RESULT', 'CURRENT_CITY', 'CURRENT_FINAL_STATE', 'TASK16_TRIAGE', 'TRIAGE_REASON', 'HUMAN_LABEL', 'HUMAN_CITY', 'HUMAN_REASON', 'HUMAN_NOTES'];
const allowed = new Set(['', 'PUBLISH', 'REJECT_NEGATIVE', 'REJECT_OFF_TOPIC', 'REJECT_INSUFFICIENT', 'REVIEW_UNCERTAIN']);

if (report.selectedRecords < 50 || report.selectedRecords > 80) throw new Error('review set is outside 50-80 target');
if (lines.length - 1 !== report.selectedRecords) throw new Error('CSV row count mismatch');
for (const column of required) if (!header.includes(column)) throw new Error(`missing CSV column: ${column}`);
if (!html.includes('Open article') || !html.includes('PUBLISH') || !html.includes('REJECT_NEGATIVE')) throw new Error('HTML review controls missing');
if (report.humanLabelsAssigned !== 0) throw new Error('human labels were prefilled');
if (!report.publishRequiresHumanCity) throw new Error('publish-city requirement missing');

console.log(JSON.stringify({
  passed: true,
  records: report.selectedRecords,
  csvColumns: header.length,
  humanLabelsAssigned: report.humanLabelsAssigned,
  publishRequiresHumanCity: report.publishRequiresHumanCity,
  labels: [...allowed].slice(1)
}));
