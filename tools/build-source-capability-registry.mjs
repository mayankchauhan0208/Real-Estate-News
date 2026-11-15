import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSourceCapabilityRegistry, writeSourceCapabilityRegistry } from "./source-capability-registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = JSON.parse(fs.readFileSync(path.join(root, "config", "admin-settings.json"), "utf8"));
const registry = buildSourceCapabilityRegistry({ settings });
const output = writeSourceCapabilityRegistry(registry);
console.log(JSON.stringify({
  configuredUrls: registry.summary.configuredUrls,
  activeRuntimeUrls: registry.summary.activeRuntimeUrls,
  mappedCityCount: registry.summary.mappedCityCount,
  output
}, null, 2));
