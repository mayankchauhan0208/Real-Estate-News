import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "brokket-final-external-positive-benchmark.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const positiveIds = new Set([
  "delhi-dda-janta-awaas-phase-ii-2026",
  "indore-ida-scheme-sales-september-2026",
  "nashik-mhada-lottery-september-2026",
  "up-rera-press-release-register"
]);
const cases = (source.evidence?.cases || []).map((item) => {
  const includedInRecall = positiveIds.has(item.id);
  return {
    BENCHMARK_ID: item.id,
    URL: item.sourceUrl || "",
    SOURCE: item.sourceEvidence || "",
    SOURCE_FAMILY: item.contentType || "UNKNOWN",
    ORIGINAL_TITLE: item.title || "",
    LANGUAGE: item.language || "unknown",
    DATE: item.date || "",
    EXPECTED_EVENT_CLASS: item.contentType || "UNKNOWN",
    EXPECTED_GEO: item.city || "unknown",
    WHY_QUALIFYING: item.sourceEvidence || item.primaryMiss || "",
    FROZEN_EXPECTED_DECISION: includedInRecall ? "PUBLISH_OR_REVIEW" : item.verified ? "REVIEW" : "EXCLUDE_UNVERIFIED",
    INCLUDED_IN_RECALL: includedInRecall,
    FROZEN_AT: "2026-10-03",
    SOURCE_VERIFIED_BEFORE_ENGINE_COMPARISON: Boolean(item.verified)
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  immutable: true,
  source: "brokket-final-external-positive-benchmark.json",
  totalManifestRows: cases.length,
  recallDenominator: cases.filter((item) => item.INCLUDED_IN_RECALL).length,
  frozenPositiveIds: [...positiveIds],
  note: "The four included rows are independently verified positive/review-eligible authority or RERA events. Surface-only and unverified rows remain in the manifest but are excluded from recall denominator. No Brokket result was used to create truth labels."
};
const outDir = path.join(root, "reports/task42-prep/task42-official-benchmark");
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify({ report, cases }, null, 2)}\n`);
const columns = Object.keys(cases[0] || {});
const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
await writeFile(path.join(outDir, "manifest.csv"), `${columns.join(",")}\n${cases.map((item) => columns.map((column) => cell(item[column])).join(",")).join("\n")}\n`);
console.log(JSON.stringify(report, null, 2));
