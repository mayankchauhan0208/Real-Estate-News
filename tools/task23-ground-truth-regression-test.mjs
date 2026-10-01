import fs from 'node:fs/promises';
const root='reports/source-audits/task23'; const report=JSON.parse(await fs.readFile(`${root}/task23-human-ground-truth-report.json`,'utf8')); const task20=JSON.parse(await fs.readFile('reports/source-audits/task20/task20-precision-recovery-report.json','utf8')); const task21=JSON.parse(await fs.readFile('reports/source-audits/task21/task21-multilingual-report.json','utf8'));
if(JSON.stringify(report.humanLabels)!==JSON.stringify({PUBLISH:11,REJECT_NEGATIVE:6,REJECT_OFF_TOPIC:2,REJECT_INSUFFICIENT:6,REVIEW_UNCERTAIN:0})) throw new Error('human ground truth changed');
if(report.language.bengaliCorrected!==true) throw new Error('Bengali correction missing');
if(report.geo.unsafeDefaultsIntroduced!==0||!report.geo.statewideProtectionPreserved) throw new Error('geo safety regression');
if(task20.after.metrics.TP!==2||task20.after.metrics.FP!==0||task20.after.metrics.TN!==67||task20.after.metrics.FN!==0||task20.after.negativeControls!=='8/8') throw new Error('Task 20 regression');
if(task21.architecture.supportedCities!==234||task21.task20Gate.negativeControls!=='8/8') throw new Error('Task 21 regression');
if(report.task21Safety.unknownLanguageAutoPublish||report.task21Safety.translationFailureAutoPublish||report.task21Safety.unsafeSourceGeoFallback) throw new Error('Task 21 safety regression');
console.log(JSON.stringify({passed:true,baseline:report.baseline,final:report.final,protection:report.protection,bengaliCorrected:true,holdout:report.holdout.evaluated}));
