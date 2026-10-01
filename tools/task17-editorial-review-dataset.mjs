import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const inputPath = path.join(root, 'reports/source-audits/task16/task16-sampled-evidence.jsonl');
const outDir = path.join(root, 'reports/source-audits/task17');
const csvPath = path.join(outDir, 'editorial-review.csv');
const htmlPath = path.join(outDir, 'editorial-review.html');
const reportPath = path.join(outDir, 'task17-editorial-review-report.json');
const allowedLabels = ['', 'PUBLISH', 'REJECT_NEGATIVE', 'REJECT_OFF_TOPIC', 'REJECT_INSUFFICIENT', 'REVIEW_UNCERTAIN'];

const rows = (await fs.readFile(inputPath, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const readable = (row) => Number(row.evidence?.textLength || 0) >= 200 && !row.evidence?.document;
const current = (row) => Boolean(row.inWindow);
const relevance = (row) => Boolean(row.relevance);
const review = (row) => ['NO_GEO', 'QUALITY', 'NO_DATE', 'OCR_REQUIRED', 'OTHER'].includes(row.finalReason);
const et = (row) => /realty\.economictimes\.indiatimes\.com/.test(row.source);
const geoOnly = (row) => row.finalReason === 'NO_GEO' && readable(row);
const negative = (row) => row.negative === true;

function score(row) {
  let value = 0;
  if (relevance(row) && readable(row)) value += 100;
  if (geoOnly(row)) value += 80;
  if (et(row) && readable(row) && current(row)) value += 70;
  if (row.groundTruth?.label === 'TRUE_VALID_POSITIVE') value += 60;
  if (review(row) && readable(row)) value += 35;
  if (negative(row)) value += 10;
  if (current(row)) value += 5;
  return value;
}

const selected = new Map();
function add(row, reason) {
  if (!readable(row) || selected.has(row.rawLink)) return;
  selected.set(row.rawLink, { row, selectionReason: reason });
}

for (const row of rows.filter((row) => relevance(row) && readable(row))) add(row, 'RELEVANCE_PASS');
for (const row of rows.filter((row) => geoOnly(row))) add(row, 'GEO_ONLY_BLOCKER');
for (const row of rows.filter((row) => et(row) && readable(row) && current(row))) add(row, 'ET_REALTY_CURRENT');
for (const row of rows.filter((row) => row.groundTruth?.label === 'TRUE_VALID_POSITIVE')) add(row, 'TASK16_TRIAGE_POSITIVE');

const negativeCategories = new Map();
for (const row of rows.filter((row) => negative(row) && readable(row))) {
  const key = row.groundTruth?.category || 'OTHER';
  const list = negativeCategories.get(key) || [];
  list.push(row); negativeCategories.set(key, list);
}
for (const [category, list] of negativeCategories) for (const row of list.sort((a, b) => a.rawLink.localeCompare(b.rawLink)).slice(0, 2)) add(row, `NEGATIVE_${category}`);

for (const row of rows.filter((row) => review(row) && readable(row)).sort((a, b) => score(b) - score(a) || a.rawLink.localeCompare(b.rawLink))) add(row, 'REVIEW_PATTERN');

const ordered = [...selected.values()].sort((a, b) => score(b.row) - score(a.row) || a.row.rawLink.localeCompare(b.row.rawLink)).slice(0, 80);
const finalRows = ordered.map(({ row, selectionReason }, index) => ({
  RECORD_ID: `task17-${String(index + 1).padStart(3, '0')}`,
  SOURCE: row.source || '',
  TITLE: row.title || row.evidence?.title || '',
  URL: row.rawLink || row.contentLink || '',
  PUBLISHED_DATE: row.date || '',
  DESCRIPTION: (row.evidence?.text || '').slice(0, 320),
  EXTRACTED_TEXT_SNIPPET: (row.evidence?.text || '').slice(0, 1200),
  CURRENT_RELEVANCE_RESULT: row.relevance ? 'PASS' : 'FAIL',
  CURRENT_NEGATIVE_RESULT: row.negative ? 'REJECT_NEGATIVE' : 'PASS',
  CURRENT_GEO_RESULT: row.cityCodes?.length ? (row.cityCodes.length === 1 ? 'CITY_FOUND' : 'AMBIGUOUS') : 'NO_GEO',
  CURRENT_CITY: (row.cityCodes || []).join('|'),
  CURRENT_FINAL_STATE: row.finalReason || '',
  TASK16_TRIAGE: row.groundTruth?.label || 'UNCERTAIN',
  TRIAGE_REASON: row.groundTruth?.reason || '',
  SELECTION_REASON: selectionReason,
  HUMAN_LABEL: '',
  HUMAN_CITY: '',
  HUMAN_REASON: '',
  HUMAN_NOTES: ''
}));

function csvCell(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
const columns = Object.keys(finalRows[0] || {});
const csv = [columns.join(','), ...finalRows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n') + '\r\n';

function htmlEscape(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const labelOptions = allowedLabels.map((label) => `<option value="${htmlEscape(label)}">${htmlEscape(label || 'Select label')}</option>`).join('');
const tableRows = finalRows.map((row) => `<tr data-record="${htmlEscape(row.RECORD_ID)}"><td>${htmlEscape(row.RECORD_ID)}</td><td>${htmlEscape(row.SOURCE)}</td><td><strong>${htmlEscape(row.TITLE)}</strong><br><a href="${htmlEscape(row.URL)}" target="_blank" rel="noopener">Open article</a><br><small>${htmlEscape(row.PUBLISHED_DATE)}</small></td><td>${htmlEscape(row.DESCRIPTION)}</td><td><details><summary>Evidence</summary>${htmlEscape(row.EXTRACTED_TEXT_SNIPPET)}</details></td><td>${htmlEscape(row.CURRENT_RELEVANCE_RESULT)}</td><td>${htmlEscape(row.CURRENT_NEGATIVE_RESULT)}</td><td>${htmlEscape(row.CURRENT_GEO_RESULT)}<br>${htmlEscape(row.CURRENT_CITY)}</td><td>${htmlEscape(row.CURRENT_FINAL_STATE)}<br><small>${htmlEscape(row.TASK16_TRIAGE)}: ${htmlEscape(row.TRIAGE_REASON)}</small></td><td><select aria-label="Human label for ${htmlEscape(row.RECORD_ID)}">${labelOptions}</select></td><td><input aria-label="Human city for ${htmlEscape(row.RECORD_ID)}"></td><td><input aria-label="Human reason for ${htmlEscape(row.RECORD_ID)}"></td><td><textarea aria-label="Human notes for ${htmlEscape(row.RECORD_ID)}"></textarea></td></tr>`).join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Task 17 Editorial Review</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#17202a}h1{margin-bottom:4px}p{max-width:1000px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #cbd5e1;padding:8px;vertical-align:top;word-break:break-word}th{background:#e2e8f0;position:sticky;top:0}th:nth-child(1){width:70px}th:nth-child(2){width:150px}th:nth-child(3){width:260px}th:nth-child(4){width:230px}th:nth-child(5){width:300px}th:nth-child(10){width:180px}th:nth-child(11){width:130px}th:nth-child(12){width:130px}th:nth-child(13){width:220px}input,select,textarea{box-sizing:border-box;width:100%;font:inherit}textarea{min-height:70px}details{white-space:pre-wrap}small{color:#475569}.invalid{background:#fee2e2}</style></head><body><h1>Task 17 Editorial Ground Truth Review</h1><p>Deterministic local review set from Task 15/16 evidence. Set exactly one human label per record. A <b>PUBLISH</b> label requires a supported city in <b>HUMAN_CITY</b>. Do not treat Task 16 triage as authoritative.</p><table><thead><tr>${columns.map((column) => `<th>${htmlEscape(column)}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table><script>document.querySelectorAll('tr').forEach(row=>{const label=row.querySelector('select');const city=row.querySelector('input');function check(){row.classList.toggle('invalid',label.value==='PUBLISH'&&!city.value.trim())}label.addEventListener('change',check);city.addEventListener('input',check)});</script></body></html>`;

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(csvPath, csv);
await fs.writeFile(htmlPath, html);
await fs.writeFile(reportPath, JSON.stringify({ reportType: 'TASK17_EDITORIAL_REVIEW_DATASET', generatedAt: new Date().toISOString(), localOnly: true, input: path.relative(root, inputPath), selectedRecords: finalRows.length, readableEvidenceRecords: rows.filter(readable).length, selectionReasons: Object.fromEntries([...new Set(finalRows.map((row) => row.SELECTION_REASON))].map((key) => [key, finalRows.filter((row) => row.SELECTION_REASON === key).length])), allowedHumanLabels: allowedLabels.slice(1), publishRequiresHumanCity: true, humanLabelsAssigned: 0, files: { csv: path.relative(root, csvPath), html: path.relative(root, htmlPath) } }, null, 2) + '\n');
console.log(JSON.stringify({ selected: finalRows.length, selectionReasons: Object.fromEntries([...new Set(finalRows.map((row) => row.SELECTION_REASON))].map((key) => [key, finalRows.filter((row) => row.SELECTION_REASON === key).length])), csv: path.relative(root, csvPath), html: path.relative(root, htmlPath) }, null, 2));
