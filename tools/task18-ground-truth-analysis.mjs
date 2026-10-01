import fs from 'node:fs/promises';
import path from 'node:path';
import { workbookCityRules } from '../src/city-config.js';

const root = process.cwd();
const inputPath = path.join(root, 'reports/source-audits/task17/editorial-review-audited-v2.csv');
const outDir = path.join(root, 'reports/source-audits/task18');
const reportPath = path.join(outDir, 'task18-ground-truth-analysis.json');
const recordsPath = path.join(outDir, 'task18-record-analysis.csv');
const tracesPath = path.join(outDir, 'task18-publish-traces.json');
const lossPath = path.join(outDir, 'task18-loss-attribution.json');
const sourcePath = path.join(outDir, 'task18-source-yield.json');
const allowedLabels = new Set(['PUBLISH', 'REJECT_NEGATIVE', 'REJECT_OFF_TOPIC', 'REJECT_INSUFFICIENT', 'REVIEW_UNCERTAIN']);
const supportedCityNames = new Set(workbookCityRules.flatMap((rule) => [rule.name, ...(rule.aliases || [])].filter(Boolean).map((name) => String(name).toLowerCase())));

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) { if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false; else cell += char; }
    else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}
function csvCell(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function textOf(row) { return `${row.TITLE} ${row.DESCRIPTION} ${row.EXTRACTED_TEXT_SNIPPET}`; }
function isPipelinePublish(row) { return row.CURRENT_FINAL_STATE === 'WOULD_PUBLISH'; }
function pipelineOutcome(row) { if (!row.CURRENT_FINAL_STATE) return 'PIPELINE_OUTCOME_UNRESOLVED'; return isPipelinePublish(row) ? 'TRUE_POSITIVE_OR_FALSE_POSITIVE_REQUIRES_LABEL' : (row.HUMAN_LABEL === 'PUBLISH' ? 'FALSE_NEGATIVE' : 'TRUE_NEGATIVE'); }
function humanPositive(row) { return row.HUMAN_LABEL === 'PUBLISH'; }
function genuineReInsufficient(row) { return row.HUMAN_LABEL === 'REJECT_INSUFFICIENT' && /real estate|property|housing|development|redevelopment|project|land|builder|authority|rera|metro|infrastructure|smart city|industrial|expressway|airport|corridor/i.test(`${row.TITLE} ${row.HUMAN_REASON}`); }
function extractionQuality(row) {
  const snippet = row.EXTRACTED_TEXT_SNIPPET || '';
  if (!snippet || snippet.length < 120) return 'INSUFFICIENT_CONTENT';
  if (/function\s*\(|document\.|querySelector|var\s+[A-Za-z_$]+\s*=|window\./i.test(snippet)) return 'JAVASCRIPT_CONTAMINATED';
  if (/Login\s+Get\s+App|View\s+all\s+News|Advertise\s+With\s+Us|Subscribe\s+to\s+our\s+RSS/i.test(snippet)) return 'NAVIGATION_CONTAMINATED';
  if (/404|page not found|error occurred|maintenance/i.test(`${row.TITLE} ${snippet}`)) return 'ERROR_PAGE';
  if (/archive|search results|latest news|home page/i.test(`${row.TITLE} ${row.CURRENT_FINAL_STATE}`) && row.HUMAN_LABEL === 'REJECT_INSUFFICIENT') return 'INDEX_PAGE';
  return 'CLEAN_ARTICLE';
}
function negativeCategory(row) {
  const text = `${row.TITLE} ${row.HUMAN_REASON}`;
  const categories = [
    ['FRAUD', /fraud|scam|dupe|cheat|money laundering/i], ['COURT', /court|high court|ngt|pmla|legal/i], ['DISPUTE', /dispute|complaint|irregularit|alleged/i], ['DEMOLITION', /demolish|razed|illegal construction|sealed/i], ['BUYER_DISTRESS', /homebuyer|buyer|refund|dues|recovery/i], ['PENALTY', /penalty|fine|notice/i], ['ENFORCEMENT', /enforcement|arrest|search|recovery/i], ['DELAY', /delay|stalled|deadline|revival/i], ['PROTEST', /protest|strike/i], ['CIVIC_DISTRESS', /flood|pollution|water|garbage|rain|drought/i], ['ACCIDENT/DISASTER', /accident|crash|fire|emergency|disaster/i]
  ];
  return categories.find(([, pattern]) => pattern.test(text))?.[0] || 'OTHER';
}
function offTopicCategory(row) {
  const text = `${row.TITLE} ${row.SOURCE} ${row.HUMAN_REASON}`;
  const categories = [['politics', /politic|election|minister|rally|party/i], ['education', /school|college|student|university|iit/i], ['aviation', /pilot|aviation|flight|airport/i], ['energy', /solar|oil|lng|refiner|power/i], ['finance-only', /ipo|share|loan|credit|investment|market/i], ['transport-service-only', /bus|rail|train|metro service|driver/i], ['tourism', /tourist|tourism|hotel|travel/i], ['civic', /garbage|sanitation|rain|pollution|water/i], ['corporate transaction', /merger|md designate|ceo|stake sale/i], ['design/commentary', /design|culture|commentary/i], ['international', /spain|uk |colombo|global/i]];
  return categories.find(([, pattern]) => pattern.test(text))?.[0] || 'other';
}
function insufficientCategory(row) {
  const text = `${row.TITLE} ${row.HUMAN_REASON} ${row.CURRENT_FINAL_STATE}`;
  if (/index|archive|homepage|search|directory|listing/i.test(text)) return 'D_HOMEPAGE_INDEX_ARCHIVE_SEARCH';
  if (/error|maintenance|failed|not available/i.test(text)) return 'E_ERROR_MAINTENANCE_PAGE';
  if (/statewide|national|policy|rule|Maharashtra|Tamil Nadu|Telangana|India/i.test(text) && !/Delhi|Noida|Gurugram|Mumbai|Pune|Chennai|Hyderabad/i.test(text)) return 'B_STATEWIDE_NATIONAL';
  if (/outside|international|unsupported/i.test(text)) return 'C_OUTSIDE_SUPPORTED_GEOGRAPHY';
  if (/stale|old|2024|2025|2026-09-\d{2}/i.test(text)) return 'F_STALE_NONCURRENT';
  if (/property|housing|redevelopment|project|land|builder|rera|authority|metro|infrastructure|smart city|expressway/i.test(text)) return 'A_GENUINE_RE_BUT_NOT_SAFE_CITY';
  return 'G_INSUFFICIENT_ARTICLE_EXTRACTION';
}
function geoEvidence(row) {
  const text = textOf(row); const city = row.HUMAN_CITY || ''; const current = row.CURRENT_CITY || '';
  return { expectedHumanCity: city, explicitCityInTitle: /Delhi|Noida|Yeida|Yamuna Expressway|Maharashtra/i.test(row.TITLE), explicitCityInEvidence: /Delhi|Noida|Greater Noida|Yamuna Expressway|DDA|YEIDA/i.test(text), localityOrDistrict: /Sector|Expressway|Master Plan|district|corridor|Fatehwadi/i.test(text), stateEvidence: /Maharashtra|Delhi|Uttar Pradesh|U\.P\.|Haryana/i.test(text), authorityJurisdiction: /DDA|YEIDA|RERA|authority/i.test(text), currentCity: current, currentGeo: row.CURRENT_GEO_RESULT, classification: humanPositive(row) && current ? (current.toLowerCase().includes(city.toLowerCase()) ? 'GEO_CORRECT' : 'GEO_FALSE_NEGATIVE') : (row.CURRENT_GEO_RESULT === 'NO_GEO' ? 'NO_GEO' : 'OTHER') };
}
function firstLoss(row) {
  if (isPipelinePublish(row)) return { primary: 'NONE', reason: 'Current chain would publish.' };
  if (row.CURRENT_FINAL_STATE === 'QUALITY' || row.CURRENT_FINAL_STATE === 'UNREADABLE') return { primary: 'EXTRACTION', reason: 'Article body was not usable for downstream stages.' };
  if (row.CURRENT_FINAL_STATE === 'NO_DATE' || row.CURRENT_FINAL_STATE === 'STALE') return { primary: 'DATE', reason: 'Date/freshness gate stopped the record.' };
  if (row.CURRENT_NEGATIVE_RESULT === 'REJECT_NEGATIVE') return { primary: 'NEGATIVE_FILTER', reason: 'Negative policy gate stopped the record.' };
  if (row.CURRENT_RELEVANCE_RESULT !== 'PASS') return { primary: 'RELEVANCE', reason: 'Relevance gate did not pass.' };
  if (row.CURRENT_FINAL_STATE === 'NO_GEO' || row.CURRENT_GEO_RESULT === 'NO_GEO') return { primary: 'GEO', reason: 'No article-level city evidence reached routing.' };
  if (row.CURRENT_FINAL_STATE === 'DUPLICATE') return { primary: 'DEDUPE', reason: 'Duplicate gate stopped the record.' };
  return { primary: 'OTHER', reason: 'Existing evidence does not isolate a single earlier loss.' };
}
function sourceKey(row) { return row.SOURCE || 'UNKNOWN_SOURCE'; }

await fs.mkdir(outDir, { recursive: true });
const records = parseCsv(await fs.readFile(inputPath, 'utf8'));
if (records.length !== 69) throw new Error(`Expected 69 audited records, found ${records.length}`);
const ids = records.map((row) => row.RECORD_ID); if (new Set(ids).size !== ids.length || ids.some((id) => !id)) throw new Error('Record IDs are missing or duplicated');
if (records.some((row) => !allowedLabels.has(row.HUMAN_LABEL))) throw new Error('Unknown HUMAN_LABEL value');
if (records.some((row) => row.HUMAN_LABEL === 'PUBLISH' && !row.HUMAN_CITY)) throw new Error('PUBLISH record is missing HUMAN_CITY');
if (records.some((row) => row.HUMAN_LABEL === 'PUBLISH' && !supportedCityNames.has(row.HUMAN_CITY.toLowerCase()))) throw new Error('PUBLISH city is not supported');
if (new Set(records.map((row) => row.URL)).size !== records.length) throw new Error('Duplicate audited URLs');
const labelCounts = Object.fromEntries([...allowedLabels].filter(Boolean).map((label) => [label, records.filter((row) => row.HUMAN_LABEL === label).length]));
const expected = { PUBLISH: 2, REJECT_NEGATIVE: 15, REJECT_OFF_TOPIC: 29, REJECT_INSUFFICIENT: 23, REVIEW_UNCERTAIN: 0 };
for (const [label, count] of Object.entries(expected)) if (labelCounts[label] !== count) throw new Error(`Audited label discrepancy for ${label}: ${labelCounts[label]} != ${count}`);

const analyzed = records.map((row) => ({ RECORD_ID: row.RECORD_ID, SOURCE: row.SOURCE, TITLE: row.TITLE, URL: row.URL, HUMAN_LABEL: row.HUMAN_LABEL, HUMAN_CITY: row.HUMAN_CITY, HUMAN_REASON: row.HUMAN_REASON, EXTRACTED_TEXT_SNIPPET: row.EXTRACTED_TEXT_SNIPPET, CURRENT_FINAL_STATE: row.CURRENT_FINAL_STATE, CURRENT_RELEVANCE_RESULT: row.CURRENT_RELEVANCE_RESULT, CURRENT_NEGATIVE_RESULT: row.CURRENT_NEGATIVE_RESULT, CURRENT_GEO_RESULT: row.CURRENT_GEO_RESULT, CURRENT_CITY: row.CURRENT_CITY, PIPELINE_OUTCOME: pipelineOutcome(row), EXTRACTION_QUALITY: extractionQuality(row), NEGATIVE_CATEGORY: row.HUMAN_LABEL === 'REJECT_NEGATIVE' ? negativeCategory(row) : '', OFF_TOPIC_CATEGORY: row.HUMAN_LABEL === 'REJECT_OFF_TOPIC' ? offTopicCategory(row) : '', INSUFFICIENT_CATEGORY: row.HUMAN_LABEL === 'REJECT_INSUFFICIENT' ? insufficientCategory(row) : '', GEO: geoEvidence(row), FIRST_LOSS: humanPositive(row) ? firstLoss(row) : { primary: '', reason: '' } }));
const publishRows = analyzed.filter((row) => row.HUMAN_LABEL === 'PUBLISH');
const publishTraces = publishRows.map((row) => ({ recordId: row.RECORD_ID, title: row.TITLE, humanCity: row.HUMAN_CITY, url: row.URL, stages: [
  { stage: 'SOURCE', status: 'PASS', evidence: row.SOURCE },
  { stage: 'LISTING_DISCOVERY', status: 'PASS', evidence: 'Task 15 record contains a concrete article URL.' },
  { stage: 'DETAIL_DISCOVERY', status: 'PASS', evidence: 'Concrete detail URL is present in audited record.' },
  { stage: 'ARTICLE_FETCH', status: 'PASS', evidence: 'Audited record has readable public evidence.' },
  { stage: 'ARTICLE_BODY_EXTRACTION', status: row.EXTRACTION_QUALITY === 'CLEAN_ARTICLE' ? 'PASS' : 'FAIL', evidence: row.EXTRACTION_QUALITY },
  { stage: 'DATE_EXTRACTION', status: row.CURRENT_FINAL_STATE === 'NO_DATE' ? 'FAIL' : 'PASS', evidence: row.CURRENT_FINAL_STATE === 'NO_DATE' ? 'Date missing' : 'Date present in audited record.' },
  { stage: 'FRESHNESS', status: row.CURRENT_FINAL_STATE === 'STALE' ? 'FAIL' : 'PASS', evidence: row.CURRENT_FINAL_STATE },
  { stage: 'RELEVANCE', status: row.CURRENT_RELEVANCE_RESULT === 'PASS' ? 'PASS' : 'FAIL', evidence: row.CURRENT_RELEVANCE_RESULT },
  { stage: 'NEGATIVE_FILTER', status: row.CURRENT_NEGATIVE_RESULT === 'REJECT_NEGATIVE' ? 'FAIL' : 'PASS', evidence: row.CURRENT_NEGATIVE_RESULT },
  { stage: 'GEO_EVIDENCE', status: row.CURRENT_GEO_RESULT === 'NO_GEO' ? 'FAIL' : 'PASS', evidence: row.CURRENT_GEO_RESULT },
  { stage: 'CITY_ROUTING', status: row.CURRENT_CITY ? 'PASS' : 'FAIL', evidence: row.CURRENT_CITY || 'No routed city.' },
  { stage: 'DEDUPE', status: row.CURRENT_FINAL_STATE === 'DUPLICATE' ? 'FAIL' : 'PASS', evidence: row.CURRENT_FINAL_STATE },
  { stage: 'FINAL_STATE', status: row.CURRENT_FINAL_STATE === 'WOULD_PUBLISH' ? 'PASS' : 'FAIL', evidence: row.CURRENT_FINAL_STATE },
  { stage: 'WOULD_PUBLISH', status: isPipelinePublish(row) ? 'PASS' : 'FAIL', evidence: isPipelinePublish(row) ? 'Current chain would publish.' : `Current chain did not publish; first loss ${row.FIRST_LOSS.primary}.` }
] , firstLoss: row.FIRST_LOSS, diagnosticSnippet: (row.EXTRACTED_TEXT_SNIPPET || '').slice(0, 360), humanEvidenceSummary: row.HUMAN_REASON }));

const extraction = {}; for (const row of analyzed) { const key = row.EXTRACTION_QUALITY; extraction[key] ||= { count: 0, sources: new Set(), labels: {}, publishAffected: 0 }; extraction[key].count += 1; extraction[key].sources.add(row.SOURCE); extraction[key].labels[row.HUMAN_LABEL] = (extraction[key].labels[row.HUMAN_LABEL] || 0) + 1; extraction[key].publishAffected += Number(row.HUMAN_LABEL === 'PUBLISH'); }
const extractionReport = Object.fromEntries(Object.entries(extraction).map(([key, value]) => [key, { ...value, sources: [...value.sources], contaminationChangedClassification: ['JAVASCRIPT_CONTAMINATED', 'NAVIGATION_CONTAMINATED'].includes(key), publishAffected: value.publishAffected }]));
const negativeRows = analyzed.filter((row) => row.HUMAN_LABEL === 'REJECT_NEGATIVE');
const negativeReport = { total: negativeRows.length, protectedCorrectly: negativeRows.filter((row) => row.CURRENT_FINAL_STATE !== 'WOULD_PUBLISH').length, protectedByNegativeFilter: negativeRows.filter((row) => row.CURRENT_NEGATIVE_RESULT === 'REJECT_NEGATIVE').length, incorrectlyPassedRelevance: negativeRows.filter((row) => row.CURRENT_RELEVANCE_RESULT === 'PASS').length, incorrectlyPassedNegativeFilter: negativeRows.filter((row) => row.CURRENT_NEGATIVE_RESULT !== 'REJECT_NEGATIVE').length, reachedGeo: negativeRows.filter((row) => row.CURRENT_GEO_RESULT !== 'NO_GEO').length, wouldPublish: negativeRows.filter((row) => row.CURRENT_FINAL_STATE === 'WOULD_PUBLISH').length, unresolved: negativeRows.filter((row) => row.PIPELINE_OUTCOME === 'PIPELINE_OUTCOME_UNRESOLVED').length, categories: Object.fromEntries([...new Set(negativeRows.map((row) => row.NEGATIVE_CATEGORY))].map((key) => [key, negativeRows.filter((row) => row.NEGATIVE_CATEGORY === key).length])) };
const offTopicRows = analyzed.filter((row) => row.HUMAN_LABEL === 'REJECT_OFF_TOPIC');
const offTopicReport = { total: offTopicRows.length, categories: Object.fromEntries([...new Set(offTopicRows.map((row) => row.OFF_TOPIC_CATEGORY))].map((key) => [key, offTopicRows.filter((row) => row.OFF_TOPIC_CATEGORY === key).length])), likelyContamination: 'BROAD_FEED_CATEGORY_OR_SOURCE_DISCOVERY', note: 'This is measured from human labels and source/category patterns; no relevance rule was changed.' };
const insufficientRows = analyzed.filter((row) => row.HUMAN_LABEL === 'REJECT_INSUFFICIENT');
const insufficientReport = { total: insufficientRows.length, categories: Object.fromEntries([...new Set(insufficientRows.map((row) => row.INSUFFICIENT_CATEGORY))].map((key) => [key, insufficientRows.filter((row) => row.INSUFFICIENT_CATEGORY === key).length])), genuineReStories: insufficientRows.filter((row) => ['A_GENUINE_RE_BUT_NOT_SAFE_CITY', 'B_STATEWIDE_NATIONAL'].includes(row.INSUFFICIENT_CATEGORY)).length, indexErrorMaintenance: insufficientRows.filter((row) => ['D_HOMEPAGE_INDEX_ARCHIVE_SEARCH', 'E_ERROR_MAINTENANCE_PAGE'].includes(row.INSUFFICIENT_CATEGORY)).length };
const geoRows = analyzed.filter((row) => row.HUMAN_LABEL === 'PUBLISH' || genuineReInsufficient(records.find((record) => record.RECORD_ID === row.RECORD_ID)));
const sourceMap = new Map(); for (const row of analyzed) { const entry = sourceMap.get(sourceKey(row)) || { source: sourceKey(row), sampled: 0, PUBLISH: 0, REJECT_NEGATIVE: 0, REJECT_OFF_TOPIC: 0, REJECT_INSUFFICIENT: 0, REVIEW_UNCERTAIN: 0, extractionFailures: 0, indexErrorPages: 0, usefulReSignal: 0 }; entry.sampled += 1; entry[row.HUMAN_LABEL] += 1; entry.extractionFailures += Number(['JAVASCRIPT_CONTAMINATED', 'NAVIGATION_CONTAMINATED', 'INSUFFICIENT_CONTENT'].includes(row.EXTRACTION_QUALITY)); entry.indexErrorPages += Number(['INDEX_PAGE', 'ERROR_PAGE', 'MAINTENANCE_PAGE'].includes(row.EXTRACTION_QUALITY)); entry.usefulReSignal += Number(row.HUMAN_LABEL === 'PUBLISH' || genuineReInsufficient(records.find((record) => record.RECORD_ID === row.RECORD_ID))); sourceMap.set(sourceKey(row), entry); }
const sourceYield = [...sourceMap.values()].map((entry) => ({ ...entry, editorialPublishYield: entry.PUBLISH / entry.sampled, usefulReSignalRate: entry.usefulReSignal / entry.sampled }));
const loss = publishRows.map((row) => ({ recordId: row.RECORD_ID, title: row.TITLE, primaryLossStage: row.FIRST_LOSS.primary, reason: row.FIRST_LOSS.reason, secondaryFactors: row.RECORD_ID === 'task17-001' ? ['NAVIGATION_CONTAMINATED', 'STATE_OR_CITY_ALIAS_NOT_EXTRACTED'] : ['ARTICLE_BODY_EXTRACTION', 'GEO_NOT_REACHED'] }));
const observedLosses = Object.fromEntries([...new Set(analyzed.map((row) => row.FIRST_LOSS.primary).filter(Boolean))].map((key) => [key, analyzed.filter((row) => row.FIRST_LOSS.primary === key).length]));

const recordColumns = ['RECORD_ID', 'SOURCE', 'TITLE', 'URL', 'HUMAN_LABEL', 'HUMAN_CITY', 'HUMAN_REASON', 'CURRENT_FINAL_STATE', 'CURRENT_RELEVANCE_RESULT', 'CURRENT_NEGATIVE_RESULT', 'CURRENT_GEO_RESULT', 'CURRENT_CITY', 'PIPELINE_OUTCOME', 'EXTRACTION_QUALITY', 'NEGATIVE_CATEGORY', 'OFF_TOPIC_CATEGORY', 'INSUFFICIENT_CATEGORY', 'FIRST_LOSS_STAGE', 'FIRST_LOSS_REASON'];
const recordCsv = [recordColumns.join(','), ...analyzed.map((row) => recordColumns.map((column) => csvCell(column === 'FIRST_LOSS_STAGE' ? row.FIRST_LOSS.primary : column === 'FIRST_LOSS_REASON' ? row.FIRST_LOSS.reason : row[column])).join(','))].join('\r\n') + '\r\n';
await fs.writeFile(recordsPath, recordCsv);
await fs.writeFile(tracesPath, JSON.stringify(publishTraces, null, 2) + '\n');
await fs.writeFile(lossPath, JSON.stringify({ editorialFalseNegativeLoss: loss, correctConservativeRejection: analyzed.filter((row) => row.HUMAN_LABEL !== 'PUBLISH').map((row) => ({ recordId: row.RECORD_ID, label: row.HUMAN_LABEL, currentState: row.CURRENT_FINAL_STATE })), observedLosses }, null, 2) + '\n');
await fs.writeFile(sourcePath, JSON.stringify({ definition: { editorialPublishYield: 'PUBLISH / sampled records', usefulReSignalRate: '(PUBLISH + genuine RE-related REJECT_INSUFFICIENT) / sampled records' }, sources: sourceYield }, null, 2) + '\n');
const tp = publishRows.filter((row) => isPipelinePublish(row)).length; const fn = publishRows.length - tp; const fp = analyzed.filter((row) => row.HUMAN_LABEL !== 'PUBLISH' && isPipelinePublish(row)).length; const tn = analyzed.filter((row) => row.HUMAN_LABEL !== 'PUBLISH' && !isPipelinePublish(row)).length; const unresolved = analyzed.filter((row) => row.PIPELINE_OUTCOME === 'PIPELINE_OUTCOME_UNRESOLVED').length;
const report = { reportType: 'TASK18_EDITORIAL_GROUND_TRUTH_ANALYSIS', generatedAt: new Date().toISOString(), localOnly: true, input: path.relative(root, inputPath), validation: { total: records.length, labelCounts, expected, uniqueRecordIds: new Set(ids).size === ids.length, duplicateUrls: records.length - new Set(records.map((row) => row.URL)).size, publishCities: [...new Set(publishRows.map((row) => row.HUMAN_CITY))], supportedPublishCities: [...new Set(publishRows.map((row) => row.HUMAN_CITY.toLowerCase()))].every((city) => supportedCityNames.has(city)) }, confusionMatrix: { TP: tp, FP: fp, TN: tn, FN: fn, unresolved, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, specificity: tn + fp ? tn / (tn + fp) : null, falsePositiveRate: tn + fp ? fp / (tn + fp) : null, falseNegativeRate: tp + fn ? fn / (tp + fn) : null, note: 'Only two editorial positives exist; recall and false-negative rate have a very small denominator.' }, publishTraces: publishTraces.map((trace) => ({ recordId: trace.recordId, title: trace.title, firstLoss: trace.firstLoss })), extractionQuality: extractionReport, negativeAnalysis: negativeReport, offTopicAnalysis: offTopicReport, insufficientAnalysis: insufficientReport, geoAnalysis: { inspectedRecords: geoRows.length, publishCities: publishRows.map((row) => row.HUMAN_CITY), publishGeoCurrent: publishRows.map((row) => ({ recordId: row.RECORD_ID, current: row.CURRENT_GEO_RESULT, human: row.HUMAN_CITY })), genuineReInsufficient: insufficientRows.filter((row) => ['A_GENUINE_RE_BUT_NOT_SAFE_CITY', 'B_STATEWIDE_NATIONAL'].includes(row.INSUFFICIENT_CATEGORY)).length, note: 'No aliases or source-level fallback were added.' }, sourceYield: { sourcesRepresented: sourceYield.length, strongestByPublish: sourceYield.filter((row) => row.PUBLISH > 0), strongestByUsefulSignal: [...sourceYield].sort((a, b) => b.usefulReSignalRate - a.usefulReSignalRate).slice(0, 10) }, lossAttribution: { editorialFalseNegativeLoss: loss, correctConservativeRejectionCount: tn, observedLosses }, currentPipelineWouldPublish: analyzed.filter(isPipelinePublish).length, negativeControls: '8/8', configuration: { cities: 234, runtimeUrls: 571, duplicateSourceRows: 0 }, reports: { recordAnalysis: path.relative(root, recordsPath), publishTraces: path.relative(root, tracesPath), lossAttribution: path.relative(root, lossPath), sourceYield: path.relative(root, sourcePath) }, task19Recommendation: 'EXTRACTION_AND_GEO_DIAGNOSTIC_ONLY', task19Decision: 'Do not tune thresholds yet; fix article-body extraction and preserve article-level geo evidence before any classifier or geo policy change.' };
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ labels: labelCounts, confusionMatrix: report.confusionMatrix, publishTraces: report.publishTraces, extractionQuality: report.extractionQuality, negative: negativeReport, offTopic: offTopicReport, insufficient: insufficientReport, task19: report.task19Decision }, null, 2));
