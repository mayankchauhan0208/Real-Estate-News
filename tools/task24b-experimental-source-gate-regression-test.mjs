import fs from "node:fs/promises";

const settings = JSON.parse(await fs.readFile("config/admin-settings.json", "utf8"));
const experimental = settings.manualSources.filter((source) => {
  const category = String(source.category || "").toLowerCase();
  const label = String(source.label || "").toLowerCase();
  return category.startsWith("regional-") || /regional\s+p2/.test(label);
});
// The source universe is intentionally expanded over time. The safety
// invariant is isolation from default runtime, not a stale fixed count.
if (experimental.length === 0) throw new Error("Expected configured experimental sources");
const enabledExperimental = experimental.filter((source) => source.enabled !== false);
delete process.env.ENABLE_EXPERIMENTAL_SOURCES;
const { getSourceUrls } = await import("../src/index.js");
const defaultUrls = new Set(getSourceUrls());
const defaultLeaks = enabledExperimental.filter((source) => defaultUrls.has(source.url));
if (defaultLeaks.length) throw new Error(`Experimental sources leaked into default runtime: ${defaultLeaks.map((source) => source.url).join(", ")}`);
process.env.ENABLE_EXPERIMENTAL_SOURCES = "true";
const optedInUrls = new Set(getSourceUrls());
const missingOptIn = enabledExperimental.filter((source) => !optedInUrls.has(source.url));
if (missingOptIn.length) throw new Error(`Explicit experimental opt-in missed sources: ${missingOptIn.map((source) => source.url).join(", ")}`);
console.log(JSON.stringify({ passed: true, experimental: experimental.length, enabledExperimental: enabledExperimental.length, defaultLeaks: 0, explicitOptIn: enabledExperimental.length }));
