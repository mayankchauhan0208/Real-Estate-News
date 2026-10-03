import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const input = path.join(root, 'reports/source-audits/task31/task31-real-50-results.json');
const rows = JSON.parse(await fs.readFile(input, 'utf8'));
const classify = (row) => {
  if (row.status === 'SUCCESS_PRODUCTIVE') return 'PRODUCTIVE';
  if (row.status === 'NO_CURRENT_CONTENT') return 'WORKING_NO_CURRENT_EVENT';
  if (row.status === 'NO_DISCOVERY') return 'LISTING_DISCOVERY_FAILED';
  if (row.status === 'TIMEOUT') return 'TIMEOUT_LISTING';
  if (row.status === 'TRANSPORT_FAILURE') return 'OTHER';
  if (row.readable === 0 && row.discovered > 0) return 'EXTRACTION_FAILED';
  return 'OTHER';
};
const classified = rows.map((row) => ({
  sourceId: row.sourceId,
  url: row.source?.url || '',
  originalStatus: row.status,
  state: classify(row),
  discovered: row.discovered || 0,
  readable: row.readable || 0,
  current: row.current || 0,
  relevantSafe: row.relevantSafe || 0,
  geoValid: row.geoValid || 0,
  review: row.review || 0,
  duplicates: row.duplicates || 0,
  uniqueWouldPublish: row.uniqueWouldPublish || 0,
  error: row.error || ''
}));
const distribution = Object.fromEntries([...new Set(classified.map((row) => row.state))].map((state) => [state, classified.filter((row) => row.state === state).length]));
const report = {
  generatedAt: new Date().toISOString(),
  source: path.relative(root, input),
  attempted: classified.length,
  distribution,
  recoverableWithoutNewAccess: classified.filter((row) => ['LISTING_DISCOVERY_FAILED', 'EXTRACTION_FAILED'].includes(row.state)).length,
  relevantSafe: classified.reduce((sum, row) => sum + row.relevantSafe, 0),
  wouldPublish: classified.reduce((sum, row) => sum + row.uniqueWouldPublish, 0),
  note: 'Classification is based on the bounded Task31 per-source result. TRANSPORT_FAILURE remains OTHER until transport-level evidence distinguishes listing, detail, or worker failure.',
  rows: classified
};
const outDir = path.join(root, 'reports/task42-prep');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'task42-builder-classification.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(outDir, 'task42-builder-classification.csv'), `${Object.keys(classified[0]).join(',')}\n${classified.map((row) => Object.values(row).map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')}\n`);
console.log(JSON.stringify({ attempted: report.attempted, distribution: report.distribution, relevantSafe: report.relevantSafe, wouldPublish: report.wouldPublish }, null, 2));
