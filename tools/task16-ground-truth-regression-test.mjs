import fs from 'node:fs/promises';

const report = JSON.parse(await fs.readFile('reports/source-audits/task16/task16-ground-truth-report.json', 'utf8'));
const task15 = JSON.parse(await fs.readFile('reports/source-audits/task15/task15-content-yield-report.json', 'utf8'));
const evidence = (await fs.readFile('reports/source-audits/task16/task16-sampled-evidence.jsonl', 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

if (report.localOnly !== true) throw new Error('Task 16 is not marked local-only');
if (report.manualValidation.sampleSize < 1 || report.evidenceRefresh.targetRecords < report.manualValidation.sampleSize) throw new Error('ground-truth evidence is empty');
if (report.negativeRejects.confirmedFalseNegatives !== 0) throw new Error('unexpected unreviewed negative false-negative claim');
if (report.etRealty.wouldPublish !== 0) throw new Error('ET Realty source fallback weakened');
if (report.goldenCorpus.positiveBefore !== 8 || report.goldenCorpus.positiveAfter !== 8 || report.goldenCorpus.negativeBefore !== 8 || report.goldenCorpus.negativeAfter !== 8) throw new Error('golden corpus changed without manual confirmation');
if (task15.frozenBaseline?.cities !== 234 || task15.frozenBaseline?.sources !== 571) throw new Error('Task 15 baseline drifted');
if (report.adapters.implemented.length !== 0) throw new Error('unjustified adapter was implemented');
if (!evidence.every((item) => item.groundTruth?.label)) throw new Error('evidence item lacks ground-truth triage label');
if (report.confusionMatrix.precision !== null || report.confusionMatrix.recall !== null) throw new Error('unverified precision/recall claimed');

console.log(JSON.stringify({
  passed: true,
  evidence: evidence.length,
  manualSample: report.manualValidation.sampleSize,
  triagedValid: report.manualValidation.trueValidPositives,
  falseNegativeFilterCases: report.negativeRejects.confirmedFalseNegatives,
  etWouldPublish: report.etRealty.wouldPublish,
  adapters: report.adapters.implemented.length,
  precision: report.confusionMatrix.precision,
  recall: report.confusionMatrix.recall
}));
