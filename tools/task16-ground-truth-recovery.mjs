import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = process.cwd();
const task15Dir = path.join(root, 'reports/source-audits/task15');
const outDir = path.join(root, 'reports/source-audits/task16');
const reportPath = path.join(outDir, 'task16-ground-truth-report.json');
const evidencePath = path.join(outDir, 'task16-sampled-evidence.jsonl');
const timeoutMs = 6000;
const concurrency = 6;
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const negativeSignals = [
  ['CRIME', /murder|rape|suicide|police|arrest|dead|killed|attack|custody|narco|abuse|crime/i],
  ['FRAUD', /fraud|scam|dupe|cheat|bribery|money laundering|fake investment/i],
  ['COURT', /court|high court|hc |ngt|pmla|legal dispute|charges/i],
  ['DISPUTE', /dispute|protest|irregularit|alleged|complaint/i],
  ['DELAY', /delay|stalled|revival|deadline|shortage|crisis/i],
  ['DEMOLITION', /demolish|razed|illegal construction|sealed/i],
  ['ACCIDENT', /accident|crash|emergency landing|flood|drought|erosion/i],
  ['POLITICS', /minister|election|polls|political|rally|pm modi|chief minister/i],
  ['GENERAL_BUSINESS', /share swap|ipo|investment strategy|ceo|md designate|demand through/i]
];
const positiveSignals = /housing|residential|property|real estate|redevelopment|builder|developer|project|master plan|smart city|metro|highway|industrial city|warehouse|land|homes?|apartments?|construction|rera|rehab|toll contract/i;
const offTopicSignals = /pilot|school|college|book|football|rainfall|pollution|garbage|oil refin|cricket|tourist|yoga|bus driver|medicine|hospital|election/i;

async function fetchBounded(url) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); const started = Date.now();
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'BrokkerNewsTask16GroundTruth/1.0 (local read-only diagnostic)', Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8' } });
    const body = await response.text(); return { ok: response.ok, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '', body, elapsedMs: Date.now() - started };
  } catch (error) { return { ok: false, status: 0, finalUrl: '', contentType: '', body: '', error: controller.signal.aborted ? 'TIMEOUT' : error.message, elapsedMs: Date.now() - started }; }
  finally { clearTimeout(timer); }
}
function category(text) { return negativeSignals.find(([, pattern]) => pattern.test(text))?.[0] || 'OTHER'; }
function labelEvidence(item, evidence) {
  if (!evidence.fetchOk || evidence.document || evidence.textLength < 200) return { label: 'INSUFFICIENT_CONTENT', reason: evidence.error || 'body not readable' };
  const text = `${item.title} ${evidence.title} ${evidence.text}`;
  const negative = category(text);
  const hasPositive = positiveSignals.test(item.title);
  const clearlyOffTopic = offTopicSignals.test(item.title) && !hasPositive;
  if (clearlyOffTopic) return { label: 'TRUE_NEGATIVE', reason: 'OFF_TOPIC', category: 'OFF_TOPIC' };
  if (item.negative && negative !== 'OTHER') return { label: 'TRUE_NEGATIVE', reason: negative, category: negative };
  if (item.relevance && hasPositive && negative === 'OTHER') return { label: 'TRUE_VALID_POSITIVE', reason: 'real-estate signal with readable evidence', category: 'POSITIVE' };
  if (item.negative && hasPositive) return { label: 'UNCERTAIN', reason: 'negative classifier and real-estate signal require human context', category: 'CONTEXT_ERROR' };
  return { label: 'UNCERTAIN', reason: 'requires human interpretation', category: 'OTHER' };
}
async function inspect(item) {
  const probe = await fetchBounded(item.rawLink || item.contentLink || item.canonicalLink);
  const evidence = { fetchOk: probe.ok, status: probe.status, finalUrl: probe.finalUrl, contentType: probe.contentType, elapsedMs: probe.elapsedMs, error: probe.error || '', document: /pdf/i.test(`${probe.contentType} ${item.rawLink}`), title: '', text: '', textLength: 0 };
  if (probe.ok && !evidence.document) { const $ = cheerio.load(probe.body || ''); evidence.title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().replace(/\s+/g, ' ').trim(); evidence.text = $('article,[itemprop="articleBody"],.article-content,.story-content,main,body').first().text().replace(/\s+/g, ' ').trim().slice(0, 4000); evidence.textLength = evidence.text.length; }
  const triage = labelEvidence(item, evidence);
  return { ...item, evidence: { ...evidence, text: evidence.text.slice(0, 1200) }, groundTruth: triage };
}
async function mapConcurrent(items, worker) { const output = []; let index = 0; async function run() { while (index < items.length) { const i = index++; output[i] = await worker(items[i]); } } await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run)); return output; }
function count(values, field) { return Object.fromEntries([...new Set(values.map((value) => value[field]))].map((key) => [key, values.filter((value) => value[field] === key).length])); }
function includesAny(item, pattern) { return pattern.test(`${item.source} ${item.title} ${item.evidence?.title || ''} ${item.evidence?.text || ''}`); }

await fs.mkdir(outDir, { recursive: true });
const [items, task15] = await Promise.all([fs.readFile(path.join(task15Dir, 'task15-items.jsonl'), 'utf8').then((text) => text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))), readJson(path.join(task15Dir, 'task15-content-yield-report.json'))]);
const sample = await readJson(path.join(task15Dir, 'task15-manual-validation-sample.json'));
const sampleLinks = new Set([...sample.accepted, ...sample.rejected, ...sample.review].map((item) => item.rawLink));
const relevancePass = items.filter((item) => item.relevance);
const negativeRejects = items.filter((item) => item.negative);
const reviewItems = items.filter((item) => ['NO_GEO', 'QUALITY', 'NO_DATE', 'OCR_REQUIRED', 'OTHER'].includes(item.finalReason));
const targetMap = new Map(); for (const item of items) if (sampleLinks.has(item.rawLink) || relevancePass.includes(item) || negativeRejects.includes(item) || reviewItems.includes(item)) targetMap.set(item.rawLink, item);
const evidence = await mapConcurrent([...targetMap.values()], inspect);
const manualSample = evidence.filter((item) => sampleLinks.has(item.rawLink));
const confirmedValid = evidence.filter((item) => item.groundTruth.label === 'TRUE_VALID_POSITIVE');
const confirmedNegative = evidence.filter((item) => item.groundTruth.label === 'TRUE_NEGATIVE');
const falseNegativeCandidates = evidence.filter((item) => item.negative && item.groundTruth.label === 'TRUE_VALID_POSITIVE');
const et = evidence.filter((item) => /realty\.economictimes\.indiatimes\.com/.test(item.source));
const ocr = items.filter((item) => item.finalReason === 'OCR_REQUIRED').slice(0, 20).map((item) => ({ source: item.source, title: item.title, label: positiveSignals.test(item.title) ? 'UNKNOWN_WITHOUT_OCR' : 'LIKELY_IRRELEVANT', reason: 'document text unavailable; metadata only' }));
const reviewGroups = count(reviewItems.map((item) => ({ group: item.finalReason === 'NO_GEO' ? 'GEO_UNCERTAIN' : item.finalReason === 'NO_DATE' ? 'DATE_UNCERTAIN' : item.finalReason === 'OCR_REQUIRED' ? 'INSUFFICIENT_CONTENT' : item.finalReason === 'QUALITY' ? 'INSUFFICIENT_CONTENT' : 'OTHER' })), 'group');
const categoryCounts = count(negativeRejects.map((item) => ({ category: category(`${item.title} ${item.source}`) })), 'category');
const groundTruthCounts = count(evidence, 'groundTruth');
const evidenceByUrl = new Map(evidence.map((item) => [item.rawLink, item]));
const relevanceUrls = new Set(relevancePass.map((item) => item.rawLink));
const reviewUrls = new Set(reviewItems.map((item) => item.rawLink));
const inspectedRelevance = evidence.filter((item) => relevanceUrls.has(item.rawLink));
const inspectedReview = evidence.filter((item) => reviewUrls.has(item.rawLink));
const report = { reportType: 'TASK16_GROUND_TRUTH_AND_HIGH_YIELD_RECOVERY', generatedAt: new Date().toISOString(), localOnly: true, sourceTask15: 'reports\\source-audits\\task15\\task15-content-yield-report.json', evidenceRefresh: { targetRecords: evidence.length, sampleRecords: manualSample.length, boundedTimeoutMs: timeoutMs, articleBodyRetained: true, note: 'Read-only evidence refresh. Labels are conservative triage; no record is treated as human truth unless the evidence is readable and the rule is explicit.' }, manualValidation: { sampleSize: manualSample.length, trueValidPositives: manualSample.filter((item) => item.groundTruth.label === 'TRUE_VALID_POSITIVE').length, trueNegatives: manualSample.filter((item) => item.groundTruth.label === 'TRUE_NEGATIVE').length, offTopic: manualSample.filter((item) => item.groundTruth.reason === 'OFF_TOPIC').length, uncertain: manualSample.filter((item) => item.groundTruth.label === 'UNCERTAIN').length, insufficientContent: manualSample.filter((item) => item.groundTruth.label === 'INSUFFICIENT_CONTENT').length, note: 'This is not a substitute for a human editorial sign-off; uncertain and insufficient records remain unverified.' }, negativeRejects: { total: negativeRejects.length, inspected: evidence.filter((item) => item.negative).length, categoryCounts, confirmedFalseNegatives: falseNegativeCandidates.length, falseNegativeRecords: falseNegativeCandidates.map((item) => ({ title: item.title, source: item.source, trigger: item.classification, context: item.evidence.text, cityCodes: item.cityCodes })) }, reviewItems: { total: task15.counters.REVIEW, inspected: inspectedReview.length, groups: reviewGroups, validPositivesHidingInReview: inspectedReview.filter((item) => item.groundTruth.label === 'TRUE_VALID_POSITIVE').length }, relevancePasses: { total: relevancePass.length, inspected: inspectedRelevance.length, valid: inspectedRelevance.filter((item) => item.groundTruth.label === 'TRUE_VALID_POSITIVE').length, invalid: inspectedRelevance.filter((item) => item.groundTruth.label === 'TRUE_NEGATIVE').length, uncertain: inspectedRelevance.filter((item) => item.groundTruth.label === 'UNCERTAIN').length }, geo: { verifiedPositiveCorrect: 0, verifiedPositiveMissing: confirmedValid.filter((item) => !item.cityCodes.length).length, verifiedPositiveIncorrect: 0, denominator: confirmedValid.length, note: 'Geo correctness requires manual city confirmation; no unsafe source fallback was used.' }, etRealty: { items: et.length, readable: et.filter((item) => item.evidence?.textLength >= 200).length, dated: et.filter((item) => item.date).length, current: et.filter((item) => item.inWindow).length, triagedTruePositives: et.filter((item) => item.groundTruth.label === 'TRUE_VALID_POSITIVE').length, triagedNegatives: et.filter((item) => item.groundTruth.label === 'TRUE_NEGATIVE').length, review: et.filter((item) => item.groundTruth.label === 'UNCERTAIN').length, geoValid: et.filter((item) => item.cityCodes.length === 1).length, duplicates: et.filter((item) => item.finalReason === 'DUPLICATE').length, wouldPublish: et.filter((item) => item.finalReason === 'WOULD_PUBLISH').length }, ocr: { sampleSize: ocr.length, labels: count(ocr.map((item) => ({ label: item.label })), 'label'), note: 'No OCR was installed or run; metadata-only estimates are not ground truth.' }, beforeAfter: { detailRecords: { before: task15.counters.DETAILS_FETCHED, after: task15.counters.DETAILS_FETCHED }, readable: { before: task15.counters.READABLE_ITEMS, after: task15.counters.READABLE_ITEMS }, inWindow: { before: task15.counters.IN_WINDOW_ITEMS, after: task15.counters.IN_WINDOW_ITEMS }, wouldPublish: { before: task15.counters.WOULD_PUBLISH, after: task15.counters.WOULD_PUBLISH } }, goldenCorpus: { positiveBefore: 8, positiveAfter: 8, negativeBefore: 8, negativeAfter: 8, addedPositive: 0, addedNegative: 0 }, confusionMatrix: { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0, precision: null, recall: null, note: 'No human editorial labels were added.' }, bottleneck: { verifiedRecoverable: {}, observedTriageLosses: { discovery: task15.bottleneckAttribution.DISCOVERY || 0, negativeFilter: task15.bottleneckAttribution.NEGATIVE_FILTER || 0, ocr: task15.bottleneckAttribution.OCR || 0, date: task15.bottleneckAttribution.DATE || 0, geo: task15.bottleneckAttribution.GEO || 0, classifier: task15.bottleneckAttribution.CLASSIFIER || 0 }, primaryVerifiedBottleneck: 'UNVERIFIED', reason: 'Ground truth is not strong enough to justify classifier, geo, or OCR changes.' }, adapters: { implemented: [], reason: 'No upstream adapter was justified by human-confirmed yield in this pass.' }, task17: 'MANUAL_EDITORIAL_LABELING_BEFORE_ANY_CLASSIFIER_OR_GEO_CHANGE', filesChanged: [], evidencePath: path.relative(root, evidencePath) };
await fs.writeFile(evidencePath, evidence.map((item) => JSON.stringify(item)).join('\n') + '\n');
await fs.writeFile(path.join(outDir, 'task16-ocr-value-sample.json'), JSON.stringify(ocr, null, 2) + '\n');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ evidence: evidence.length, manualSample: manualSample.length, confirmedValid: report.manualValidation.trueValidPositives, confirmedFalseNegatives: report.negativeRejects.confirmedFalseNegatives, relevance: report.relevancePasses, etRealty: report.etRealty, ocr: report.ocr, report: path.relative(root, reportPath) }, null, 2));
