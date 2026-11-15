import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSourceCapabilityRegistry } from "./source-capability-registry.mjs";
import { buildCityCoverageIntelligence, readRuntimeProbeRows, writeCityCoverageIntelligence } from "./city-coverage-intelligence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = JSON.parse(fs.readFileSync(path.join(root, "config", "admin-settings.json"), "utf8"));
const report = buildCityCoverageIntelligence({ registry: buildSourceCapabilityRegistry({ settings }), probeRows: readRuntimeProbeRows() });
console.log(JSON.stringify({ ...report.summary, output: writeCityCoverageIntelligence(report) }, null, 2));
