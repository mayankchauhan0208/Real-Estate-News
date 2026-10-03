import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'reports/source-audits/task42/geo-benchmark.json');
const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const allowedCauses = new Set([
  'PROJECT_MAPPING_MISSING', 'LOCALITY_MAPPING_MISSING', 'SECTOR_MAPPING_MISSING',
  'AUTHORITY_JURISDICTION_MISSING', 'DISTRICT_MAPPING_MISSING', 'NATIVE_ALIAS_MISSING',
  'DEVELOPER_PROJECT_MAPPING_MISSING', 'ARTICLE_EVIDENCE_NOT_EXTRACTED',
  'DOCUMENT_EVIDENCE_NOT_EXTRACTED', 'MULTI_CITY_UNDERSPECIFIED', 'CONFIDENCE_TOO_LOW',
  'GENUINELY_AMBIGUOUS', 'OTHER'
]);

function classify(row) {
  // These rows are editorial negatives/insufficient controls. Their expected
  // city is useful context, but routing them would create false-positive geo
  // coverage. Keep them accounted for without treating them as recoverable
  // positive recall misses.
  if (row.human_label === 'REJECT_NEGATIVE' || row.human_label === 'REJECT_OFF_TOPIC') {
    return { cause: 'OTHER', routable: false, explanation: 'Non-publishable negative/off-topic control; geo intentionally suppressed.' };
  }
  if (row.human_label === 'REJECT_INSUFFICIENT') {
    return { cause: 'ARTICLE_EVIDENCE_NOT_EXTRACTED', routable: false, explanation: 'Insufficient article evidence; city field alone is not publishable geo proof.' };
  }
  return { cause: 'GENUINELY_AMBIGUOUS', routable: false, explanation: 'No independent positive evidence for safe routing.' };
}

const misses = source.records.filter((row) => row.outcome === 'MISSED_CITY' || row.outcome === 'MISSED').map((row) => {
  const classification = classify(row);
  return {
    GEO_ID: row.benchmark_id,
    SOURCE: row.source,
    LANGUAGE: row.language || row.languageScript || 'not-captured',
    EVENT: row.human_label || 'UNKNOWN',
    EXPECTED_GEO: row.expected,
    CURRENT_GEO: row.actual,
    AVAILABLE_EVIDENCE: row.city_evidence || '',
    FIRST_GEO_LOSS_STAGE: classification.routable ? 'ROUTING' : 'EDITORIAL_QUALIFICATION_BEFORE_ROUTING',
    PRIMARY_CAUSE: classification.cause,
    ROUTABLE_POSITIVE_RECALL_CASE: classification.routable,
    EXPLANATION: classification.explanation
  };
});
if (misses.some((row) => !allowedCauses.has(row.PRIMARY_CAUSE))) throw new Error('Unknown geo miss cause');
const causeCounts = Object.fromEntries([...new Set(misses.map((row) => row.PRIMARY_CAUSE))].map((cause) => [cause, misses.filter((row) => row.PRIMARY_CAUSE === cause).length]));
const report = {
  generatedAt: new Date().toISOString(),
  source: path.relative(root, sourcePath),
  benchmarkSize: source.cases,
  missCount: misses.length,
  causeCounts,
  positiveRoutableDenominator: misses.filter((row) => row.ROUTABLE_POSITIVE_RECALL_CASE).length,
  note: 'The 22 frozen geo misses are not 22 publishable recall opportunities. Six are insufficient-evidence controls and sixteen are negative/off-topic controls. No routing broadening was applied.',
  rows: misses
};
const outDir = path.join(root, 'reports/task42-prep');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'task42-geo-miss-analysis.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(outDir, 'task42-geo-miss-analysis.csv'), `${Object.keys(misses[0]).join(',')}\n${misses.map((row) => Object.values(row).map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')}\n`);
console.log(JSON.stringify({ missCount: report.missCount, causeCounts: report.causeCounts, positiveRoutableDenominator: report.positiveRoutableDenominator }, null, 2));
