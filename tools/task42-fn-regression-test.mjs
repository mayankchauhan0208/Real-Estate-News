import fs from "node:fs/promises";

const fn = JSON.parse(await fs.readFile("reports/source-audits/task42/false-negative-audit.json", "utf8"));
const precision = JSON.parse(await fs.readFile("reports/source-audits/task42/precision-benchmark.json", "utf8"));
const task20 = JSON.parse(await fs.readFile("reports/source-audits/task20/task20-precision-recovery-report.json", "utf8"));
const task23 = JSON.parse(await fs.readFile("reports/source-audits/task23/task23-final-confusion.json", "utf8"));
const expectedRemaining = [];
const actualUnresolved = fn.records.filter((row) => row.recovery_status !== "RECOVERED_RELEVANCE_GEO_SAFETY").map((row) => row.benchmark_id).sort();
if (JSON.stringify(actualUnresolved) !== JSON.stringify(expectedRemaining)) throw new Error(`Unexpected remaining FN set: ${actualUnresolved.join(",")}`);
if (fn.recovered !== 7 || fn.remaining !== 0) throw new Error("Unexpected FN recovery count");
if (precision.confusion.FP !== 0 || precision.confusion.TP !== 13 || precision.confusion.FN !== 0) throw new Error("Task42 precision gate changed");
if (task20.after.metrics.TP !== 2 || task20.after.metrics.FP !== 0 || task20.after.metrics.TN !== 67 || task20.after.metrics.FN !== 0) throw new Error("Task20 regression changed");
if (task23.final.FP !== 0 || task23.final.TP !== 11 || task23.final.FN !== 0) throw new Error("Task23 recovery gate changed");
console.log(JSON.stringify({ passed: true, recovered: fn.recovered, remaining: fn.remaining, task42: precision.confusion, task20: task20.after.metrics, task23: task23.final }, null, 2));
