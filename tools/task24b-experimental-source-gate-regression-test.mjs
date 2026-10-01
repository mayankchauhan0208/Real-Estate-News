import fs from "node:fs/promises";

const settings = JSON.parse(await fs.readFile("config/admin-settings.json", "utf8"));
const experimental = settings.manualSources.filter((source) => {
  const category = String(source.category || "").toLowerCase();
  const label = String(source.label || "").toLowerCase();
  return category.startsWith("regional-") || /regional\s+p2/.test(label);
});
if (experimental.length !== 18) throw new Error(`Expected 18 experimental sources, found ${experimental.length}`);
delete process.env.ENABLE_EXPERIMENTAL_SOURCES;
const { getSourceUrls } = await import("../src/index.js");
const defaultUrls = new Set(getSourceUrls());
const defaultLeaks = experimental.filter((source) => defaultUrls.has(source.url));
if (defaultLeaks.length) throw new Error(`Experimental sources leaked into default runtime: ${defaultLeaks.map((source) => source.url).join(", ")}`);
process.env.ENABLE_EXPERIMENTAL_SOURCES = "true";
const optedInUrls = new Set(getSourceUrls());
const missingOptIn = experimental.filter((source) => !optedInUrls.has(source.url));
if (missingOptIn.length) throw new Error(`Explicit experimental opt-in missed sources: ${missingOptIn.map((source) => source.url).join(", ")}`);
console.log(JSON.stringify({ passed: true, experimental: experimental.length, defaultLeaks: 0, explicitOptIn: experimental.length }));
