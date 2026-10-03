import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const rows = JSON.parse(await fs.readFile(path.join(root, "reports/source-audits/task28/task28-monitor-rows.json"), "utf8"));
const timeouts = rows.filter((row) => row.transport === "TIMEOUT").map((row) => {
  let host = "UNKNOWN";
  try { host = new URL(row.url).hostname; } catch {}
  return { host, source_type: row.source_type || "UNKNOWN", configured_cities: row.configured_cities || "", elapsed_ms: Number(row.elapsed_ms || 0), url: row.url };
});
const group = (key) => Object.fromEntries(Object.entries(timeouts.reduce((acc, row) => {
  const value = row[key] || "UNKNOWN";
  const item = acc[value] || { count: 0, elapsed_ms: 0 };
  item.count += 1;
  item.elapsed_ms += row.elapsed_ms;
  acc[value] = item;
  return acc;
}, {})).map(([name, value]) => [name, { count: value.count, average_elapsed_ms: Math.round(value.elapsed_ms / value.count) }]).sort((a, b) => b[1].count - a[1].count));
const output = {
  generatedAt: new Date().toISOString(),
  timeoutCount: timeouts.length,
  byHost: group("host"),
  bySourceType: group("source_type"),
  byConfiguredCityScope: group("configured_cities"),
  sources: timeouts,
  interpretation: "This is evidence from bounded listing requests. It does not infer DNS/TLS/TTFB without transport-level telemetry; those remain unresolved for failed sources."
};
const out = path.join(root, "reports/task42-prep/task42-timeout-analysis.json");
await fs.writeFile(out, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ timeoutCount: output.timeoutCount, bySourceType: output.bySourceType, topHosts: Object.entries(output.byHost).slice(0, 12) }, null, 2));
