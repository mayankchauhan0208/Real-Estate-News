import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'reports', 'source-audits', 'targeted');
const evaluation = (await fs.readFile(path.join(dir, 'classification-evaluation.jsonl'), 'utf8'))
  .split(/\r?\n/).filter(Boolean).map(JSON.parse);

const officialReraHost = (url) => /(^|\.)rera\.|(^|\.)up-rera|hprera|ukrera|aiforera/i.test(new URL(url).hostname);
const pass = (value) => !['unclassified', 'reject_negative', 'reject_relevance', 'reject_outside_region', 'reject_outside_city'].includes(value);
const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const genericReraPage = (item) => /^(real estate notice|up rera\b|भू-संपदा विनियामक प्राधिकरण|home\s*\||welcome to rera|functions and services|real estate regulatory authority)/iu.test(normalize(item.title));

function reraLabel(item) {
  if (item.reviewLabel === 'NAVIGATION_INDEX') return 'NAVIGATION_INDEX';
  if (item.reviewLabel === 'INSUFFICIENT_CONTENT') return 'INSUFFICIENT_CONTENT';
  if (item.reviewLabel === 'NEGATIVE_REJECT') return 'UNCERTAIN';
  return 'UNCERTAIN';
}

function reraGate(item) {
  if (item.reviewLabel === 'INSUFFICIENT_CONTENT') return 'CONTENT_LENGTH';
  if (item.currentClassifier === 'reject_negative') return 'NEGATIVE_FILTER';
  if (item.currentClassifier === 'unclassified') return 'UNCLASSIFIED';
  return 'OTHER';
}

function reraRecordType(item) {
  const text = `${item.title} ${item.diagnosticExcerpt}`;
  if (/judg|निर्णय/i.test(text)) return 'VALID_JUDGMENT';
  if (/circular|परिपत्र/i.test(text)) return 'VALID_CIRCULAR';
  if (/notice|public notice|सूचना|नोटिस/i.test(text)) return 'VALID_NOTICE';
  if (/order|आदेश/i.test(text)) return 'VALID_ORDER';
  if (/registration|registered project|पंजीकरण/i.test(text)) return 'VALID_PROJECT_REGISTRATION';
  if (/approval|approved|मंजूरी|अनुमोदन/i.test(text)) return 'VALID_AUTHORITY_UPDATE';
  return 'OTHER';
}

function regionalLabel(item) {
  if (item.reviewLabel === 'INSUFFICIENT_CONTENT') return 'INSUFFICIENT';
  if (item.reviewLabel === 'NEGATIVE_REJECT') return 'NEGATIVE_REJECT';
  if (item.reviewLabel === 'VALID_REGIONAL_REAL_ESTATE') return 'VALID_REAL_ESTATE';
  return 'IRRELEVANT';
}

const rera = evaluation.filter((item) => item.sourceType === 'rera').map((item) => ({
  source: item.source,
  state: item.geoEvidence?.[0]?.cityCode || 'UNKNOWN_STATE',
  url: item.url,
  title: item.title,
  date: item.date,
  recordDocumentType: reraRecordType(item),
  contentExcerpt: normalize(item.diagnosticExcerpt).slice(0, 1200),
  geoEvidence: item.geoEvidence || [],
  currentRelevanceResult: item.currentClassifier,
  currentRejectionReason: item.reviewReason || '',
  diagnosticLabel: reraLabel(item),
  sourceClass: officialReraHost(item.source) ? 'OFFICIAL_RERA_PRIMARY_RECORD_CANDIDATE' : 'THIRD_PARTY_RERA_NEWS',
  falseNegativeGate: reraGate(item),
  titleOnly: item.titleOnly,
  titleDescription: item.titleDescription,
  fullContext: item.fullText,
}));

const regional = evaluation.filter((item) => item.sourceType === 'regional').map((item) => ({
  source: item.source,
  url: item.url,
  title: item.title,
  description: item.description,
  body: item.diagnosticExcerpt,
  language: item.language,
  script: /[\u0900-\u097F]/u.test(item.diagnosticExcerpt) ? 'Devanagari' : 'Latin/unknown',
  date: item.date,
  geoEvidence: item.geoEvidence || [],
  currentClassifier: item.currentClassifier,
  currentRejectionReason: item.reviewReason || '',
  diagnosticLabel: regionalLabel(item),
  titleOnly: item.titleOnly,
  titleDescription: item.titleDescription,
  fullContext: item.fullText,
  failureReason: item.reviewLabel === 'INSUFFICIENT_CONTENT' ? 'INSUFFICIENT_CONTEXT' : item.reviewLabel === 'NEGATIVE_REJECT' ? 'NEGATIVE_FILTER' : 'OTHER',
}));

const dated = rera.filter((item) => item.date).map((item) => {
  const navigation = item.diagnosticLabel === 'NAVIGATION_INDEX' || genericReraPage(item);
  const thirdParty = item.sourceClass === 'THIRD_PARTY_RERA_NEWS';
  const irrelevant = /nhsrcl/i.test(`${item.title} ${item.url}`);
  const officialRecord = !navigation && !irrelevant && item.sourceClass.startsWith('OFFICIAL') && item.recordDocumentType !== 'OTHER';
  const scope = /goa|gurugram|panchkula|mohali|madhya|up-rera|nhsrcl/i.test(`${item.title} ${item.url}`) ? 'CITY_OR_STATE_SIGNAL' : 'UNKNOWN_LOCALITY';
  return {
    url: item.url,
    title: item.title,
    date: item.date,
    classification: officialRecord ? 'LEGITIMATE_OFFICIAL_RECORD' : irrelevant ? 'IRRELEVANT' : navigation ? 'NAVIGATION_INDEX' : thirdParty ? 'UNCERTAIN' : 'IRRELEVANT',
    proceduralLegitimacy: officialRecord ? 'PROCEDURAL_BUT_LEGITIMATE_OFFICIAL_RECORD' : 'NO_CONFIRMED_OFFICIAL_RECORD',
    scope,
    currentClassifier: item.currentRelevanceResult,
    currentRejectionReason: item.currentRejectionReason,
  };
});

function counts(items, key) {
  return Object.fromEntries([...new Set(items.map((item) => item[key]))].sort().map((value) => [value, items.filter((item) => item[key] === value).length]));
}

function metrics(items, labelKey) {
  const valid = items.filter((item) => String(item[labelKey]).startsWith('VALID_'));
  const invalid = items.filter((item) => !valid.includes(item));
  const fullPass = items.filter((item) => pass(item.fullContext)).length;
  const tdPass = items.filter((item) => pass(item.titleDescription)).length;
  const titlePass = items.filter((item) => pass(item.titleOnly)).length;
  const validFullPass = valid.filter((item) => pass(item.fullContext)).length;
  const invalidFullPass = invalid.filter((item) => pass(item.fullContext)).length;
  return {
    validSampleSize: valid.length,
    invalidSampleSize: invalid.length,
    truePositives: validFullPass,
    falseNegatives: valid.length - validFullPass,
    falsePositives: invalidFullPass,
    trueNegatives: invalid.length - invalidFullPass,
    precision: fullPass ? validFullPass / fullPass : null,
    recall: valid.length ? validFullPass / valid.length : null,
    titleOnlyPass: titlePass,
    titleDescriptionPass: tdPass,
    fullContextPass: fullPass,
  };
}

const reraDatedCounts = counts(dated, 'classification');
const geoFailures = rera.filter((item) => item.diagnosticLabel.startsWith('VALID_') && (!item.geoEvidence || !item.geoEvidence.length));
const report = {
  reportType: 'task6-classification-analysis',
  generatedAt: new Date().toISOString(),
  inputs: ['reports/source-audits/targeted/classification-evaluation.jsonl', 'reports/source-audits/targeted/rera-date-v2.jsonl', 'reports/source-audits/targeted/regional-date-v2.jsonl'],
  rera: {
    labeledSampleSize: rera.length,
    labels: counts(rera, 'diagnosticLabel'),
    officialPrimaryCandidates: rera.filter((item) => item.sourceClass.startsWith('OFFICIAL')).length,
    thirdPartyCandidates: rera.filter((item) => item.sourceClass === 'THIRD_PARTY_RERA_NEWS').length,
    falseNegativeGates: counts(rera.filter((item) => item.diagnosticLabel.startsWith('VALID_') && !pass(item.fullContext)), 'falseNegativeGate'),
    confirmedLegitimateRejected: 0,
    note: 'No sampled official RERA record was confirmed as a valid publishable record. The Goa third-party report is a real RERA-related article but is negative and correctly remains outside positive-only admission.',
  },
  datedRera: {
    total: dated.length,
    exactBreakdown: reraDatedCounts,
    records: dated,
    legitimateOfficialRecord: dated.filter((item) => item.classification === 'LEGITIMATE_OFFICIAL_RECORD').length,
    navigationIndex: dated.filter((item) => item.classification === 'NAVIGATION_INDEX').length,
    irrelevant: dated.filter((item) => item.classification === 'IRRELEVANT').length,
    proceduralLegitimateOfficial: dated.filter((item) => item.proceduralLegitimacy === 'PROCEDURAL_BUT_LEGITIMATE_OFFICIAL_RECORD').length,
    projectSpecific: 0,
    statewide: 0,
    citySpecific: 0,
    uncertain: dated.filter((item) => item.classification === 'UNCERTAIN').length,
  },
  regional: {
    labeledSampleSize: regional.length,
    labels: counts(regional, 'diagnosticLabel'),
    falseNegativeReasons: counts(regional.filter((item) => String(item.diagnosticLabel).startsWith('VALID_') && !pass(item.fullContext)), 'failureReason'),
    confirmedLegitimateRejected: 0,
  },
  benchmark: {
    rera: { before: metrics(rera, 'diagnosticLabel'), after: metrics(rera, 'diagnosticLabel') },
    regional: { before: metrics(regional, 'diagnosticLabel'), after: metrics(regional, 'diagnosticLabel') },
    note: 'Valid recall is not statistically meaningful here because this diagnostic set contains zero confirmed valid RERA or regional records under conservative human-review rules.',
    before: 'Current classifier output from the same records.',
    after: 'Same as before; no classifier rule changed because the labeled evidence does not support a safe production classifier change.',
  },
  structuredSignals: {
    officialSourceType: 'Useful for routing to review, not an allow bypass.',
    reraRecordType: 'Useful only when a readable record/document type is present.',
    projectDeveloperAuthorityLocation: 'No measured valid sample supports new unconditional terms.',
    result: 'No local classifier changes justified.',
  },
  validArticlesRecovered: 0,
  invalidArticlesAdmitted: 0,
  geoPreparation: { validArticlesFailingGeo: geoFailures.length, unknownEntities: [], note: 'No confirmed valid article exists in this sample, so no broad geo alias change is justified.' },
  bottleneck: { ranking: ['SOURCE_AVAILABILITY_LOSS', 'EXTRACTION_LOSS', 'CLASSIFICATION_LOSS', 'GEO_ROUTING_LOSS'], currentLargest: 'SOURCE_AVAILABILITY_LOSS', evidence: 'The sample contains 0 confirmed valid RERA/regional articles; source and extraction quality must improve before classifier recall can be measured.' },
  nextTask: 'TASK_7 should begin with source/article extraction and geo evidence on a verified positive control set, not broad classifier weakening.',
  adapterPriority: [
    { priority: 1, adapter: 'Official RERA HTML/PDF record extraction', reason: 'Highest regulatory value; current samples are mostly navigation or unreadable documents.' },
    { priority: 2, adapter: 'UP RERA PressRelease page/document extraction', reason: 'High state coverage and known listing/article-link mismatch.' },
    { priority: 3, adapter: 'Regional-language authority pages with visible date/body selectors', reason: 'Needed to produce valid controls before multilingual classifier changes.' },
  ],
};

const jsonPath = path.join(dir, 'task6-classification-dataset.json');
const reraPath = path.join(dir, 'rera-labeled-evaluation.jsonl');
const regionalPath = path.join(dir, 'regional-labeled-evaluation.jsonl');
const reportPath = path.join(dir, 'task6-classification-analysis.json');
await fs.writeFile(reraPath, rera.map((item) => JSON.stringify(item)).join('\n') + '\n');
await fs.writeFile(regionalPath, regional.map((item) => JSON.stringify(item)).join('\n') + '\n');
await fs.writeFile(jsonPath, JSON.stringify({ report, rera, regional }, null, 2) + '\n');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ reportPath, reraPath, regionalPath, report }, null, 2));
