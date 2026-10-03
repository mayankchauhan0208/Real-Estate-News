import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const inputPath = path.join(root, "reports/source-audits/task28/task28-monitor-rows.json");
const outDir = path.join(root, "reports/task42-prep");
const rows = JSON.parse(await fs.readFile(inputPath, "utf8"));

function classify(row) {
  if (row.transport === "TIMEOUT") return { state: "TIMEOUT", stage: "LISTING_FETCH", reason: "bounded listing request timed out" };
  if (row.transport === "FAILED") {
    if (row.http_status === 404) return { state: "HTTP_404", stage: "HTTP", reason: "listing returned HTTP 404" };
    if (Number(row.http_status) >= 500) return { state: "HTTP_5XX", stage: "HTTP", reason: `listing returned HTTP ${row.http_status}` };
    return { state: "DISCOVERY_BROKEN", stage: "LISTING_FETCH", reason: row.failure_reason || "listing request failed" };
  }
  if (!row.discovered_links) return { state: "LISTING_ONLY", stage: "DISCOVERY", reason: "listing succeeded but no article link was extracted" };
  if (!row.readable_articles) return { state: "ARTICLE_EXTRACTION_BROKEN", stage: "DETAIL_PARSE", reason: "detail link was found but no readable article body was extracted" };
  if (!row.current_articles) return { state: "WORKING_NO_CURRENT_SUPPLY", stage: "DATE", reason: "readable content had no article inside the current window" };
  if (row.unique_candidates) return { state: "PRODUCTIVE_FULL_ARTICLE", stage: "DECISION", reason: "at least one current article passed the canonical publication gate" };
  if (row.geo_valid_articles === 0) return { state: "GEO_BROKEN", stage: "GEO", reason: "current readable content did not produce a supported city route" };
  return { state: "LOW_YIELD", stage: "DECISION", reason: "current and geo-valid content did not pass the canonical publication gate" };
}

const classified = rows.map((row) => ({
  source_id: row.source_id,
  source: row.source_name,
  url: row.url,
  source_type: row.source_type,
  configured_cities: row.configured_cities,
  transport: row.transport,
  http_status: row.http_status,
  discovered_links: row.discovered_links,
  readable_articles: row.readable_articles,
  current_articles: row.current_articles,
  geo_valid_articles: row.geo_valid_articles,
  unique_candidates: row.unique_candidates,
  ...classify(row)
}));

const counts = (key) => Object.fromEntries(Object.entries(classified.reduce((acc, row) => {
  const value = row[key] || "UNKNOWN";
  acc[value] = (acc[value] || 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1]));

const stage = {
  configured: rows.length,
  successful: rows.filter((row) => row.transport === "SUCCESS").length,
  failed: rows.filter((row) => row.transport === "FAILED").length,
  timedOut: rows.filter((row) => row.transport === "TIMEOUT").length,
  discovered: rows.filter((row) => row.discovered_links > 0).length,
  readable: rows.filter((row) => row.readable_articles > 0).length,
  current: rows.filter((row) => row.current_articles > 0).length,
  geoValid: rows.filter((row) => row.geo_valid_articles > 0).length,
  canonicalCandidates: rows.filter((row) => row.unique_candidates > 0).length
};

const summary = {
  generatedAt: new Date().toISOString(),
  sourceAudit: "reports/source-audits/task28/task28-monitor-rows.json",
  stage,
  primaryHealthStates: counts("state"),
  failureStages: counts("stage"),
  transport: counts("transport"),
  note: "Primary state is deterministic and mutually exclusive. This is acquisition/qualification evidence only; it does not publish or mutate production state."
};

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "task42-source-funnel.json"), `${JSON.stringify({ summary, sources: classified }, null, 2)}\n`);
const headers = Object.keys(classified[0] || {});
const csv = [headers.join(","), ...classified.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n") + "\n";
await fs.writeFile(path.join(outDir, "task42-source-health.csv"), csv);
console.log(JSON.stringify(summary, null, 2));
