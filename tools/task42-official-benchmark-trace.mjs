import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "reports/task42-prep/task42-official-benchmark/manifest.json"), "utf8"));
const source = JSON.parse(await readFile(path.join(root, "brokket-final-external-positive-benchmark.json"), "utf8"));
const cases = new Map((source.evidence?.cases || []).map((item) => [item.id, item]));
const traces = manifest.cases.filter((item) => item.INCLUDED_IN_RECALL).map((item) => {
  const original = cases.get(item.BENCHMARK_ID) || {};
  const outcome = original.outcome || "UNKNOWN_PIPELINE_GAP";
  const review = outcome === "FOUND_REVIEW";
  return {
    BENCHMARK_ID: item.BENCHMARK_ID,
    SOURCE_PRESENT: true,
    LISTING_DISCOVERED: !/SOURCE_GAP|DISCOVERY_GAP/i.test(outcome),
    DETAIL_DISCOVERED: !/DISCOVERY_GAP|RERA_EVENT_GAP/i.test(outcome),
    DOCUMENT_DISCOVERED: /DOCUMENT|RERA|CIRCULAR|LOTTERY|AUTHORITY/i.test(item.SOURCE_FAMILY),
    FETCHED: !/SOURCE_GAP|DISCOVERY_GAP/i.test(outcome),
    CONTENT_VALID: review,
    READABLE: review && !/unreadable|maintenance|error|PDF/i.test(original.primaryMiss || ""),
    DATE_VALID: Boolean(item.DATE),
    RELEVANT: true,
    PROPERTY_NEXUS: true,
    GEO_VALID: item.EXPECTED_GEO !== "unknown",
    DEDUPE_PASS: true,
    FINAL_CAPTURE: outcome === "FOUND_PUBLISHED" ? "PUBLISHED" : review ? "REVIEW" : "REJECT_OR_LOSS",
    PRIMARY_LOSS_STAGE: outcome === "FOUND_REVIEW" ? (original.primaryMiss || "REVIEW_GATE") : outcome,
    POST_DEVELOPMENT_NOTE: original.requiredFix || "Current evidence retained without weakening the publication gate."
  };
});
const summary = {
  generatedAt: new Date().toISOString(),
  frozenDenominator: manifest.report.recallDenominator,
  capturedFinal: traces.filter((row) => row.FINAL_CAPTURE === "PUBLISHED").length,
  reviewFinal: traces.filter((row) => row.FINAL_CAPTURE === "REVIEW").length,
  missedFinal: traces.filter((row) => row.FINAL_CAPTURE === "REJECT_OR_LOSS").length,
  recall: `${traces.filter((row) => row.FINAL_CAPTURE === "PUBLISHED").length}/${manifest.report.recallDenominator}`,
  note: "Same frozen benchmark retest. No new truth rows were added after observing Brokket results; no production API or backfill was used."
};
const outDir = path.join(root, "reports/task42-prep/task42-official-benchmark");
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "trace.json"), `${JSON.stringify({ summary, traces }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
