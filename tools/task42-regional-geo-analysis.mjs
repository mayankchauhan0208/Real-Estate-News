import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const input = path.join(root, 'reports/source-audits/task39/regional-go-live.json');
const report = JSON.parse(await fs.readFile(input, 'utf8'));
const rows = [...(report.reviewArticles || []), ...(report.hardRejectArticles || []), ...(report.safeAutoPublishArticles || [])]
  .filter((row, index, all) => !row.city && all.findIndex((candidate) => candidate.url === row.url) === index);
const classify = (row) => {
  const reasons = row.reasons || [];
  if (reasons.some((reason) => /negative|outside-city|outside region/i.test(reason))) return 'NEGATIVE';
  if (reasons.some((reason) => /not positive|spam|quality judge/i.test(reason))) return 'OFFTOPIC';
  if (reasons.some((reason) => /review:|full article|insufficient/i.test(reason))) return 'INSUFFICIENT';
  return 'QUALIFYING_POSITIVE';
};
const analyzed = rows.map((row) => ({
  title: row.title,
  source: row.source,
  language: row.language,
  url: row.url,
  expectedClassification: classify(row),
  firstGeoLossStage: row.fullArticleRead ? 'GEO_ROUTING' : 'ARTICLE_EVIDENCE_NOT_EXTRACTED',
  primaryCause: row.fullArticleRead ? 'CONFIDENCE_TOO_LOW' : 'ARTICLE_EVIDENCE_NOT_EXTRACTED',
  reasons: row.reasons || []
}));
const counts = Object.fromEntries([...new Set(analyzed.map((row) => row.expectedClassification))].map((key) => [key, analyzed.filter((row) => row.expectedClassification === key).length]));
const output = { generatedAt: new Date().toISOString(), source: path.relative(root, input), inputGeoUncertain: rows.length, counts, rows: analyzed, note: 'No geo mapping was added for negative, off-topic, or insufficient records. Positive records require verified location evidence before routing.' };
const outDir = path.join(root, 'reports/task42-prep');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'task42-regional-geo-analysis.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ inputGeoUncertain: output.inputGeoUncertain, counts }, null, 2));
