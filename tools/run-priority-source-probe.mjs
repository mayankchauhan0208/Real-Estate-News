import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(process.execPath, [fileURLToPath(new URL("./build-priority-source-probe-input.mjs", import.meta.url))], {
  stdio: "inherit"
});
if (result.status !== 0) process.exit(result.status || 1);

const audit = spawnSync(process.execPath, [fileURLToPath(new URL("./audit-source-health.mjs", import.meta.url))], {
  stdio: "inherit",
  env: {
    ...process.env,
    SOURCE_AUDIT_URLS_FILE: "reports/source-capabilities/priority-source-probe-urls.txt",
    ENABLE_EXPERIMENTAL_SOURCES: "true",
    PRIORITY_SOURCE_PROBE_LIMIT: process.env.PRIORITY_SOURCE_PROBE_LIMIT || "8",
    PRIORITY_SOURCE_PROBE_OFFSET: process.env.PRIORITY_SOURCE_PROBE_OFFSET || "0",
    SOURCE_AUDIT_CONCURRENCY: process.env.SOURCE_AUDIT_CONCURRENCY || "4",
    SOURCE_AUDIT_TIMEOUT_MS: process.env.SOURCE_AUDIT_TIMEOUT_MS || "12000",
    SOURCE_AUDIT_ARTICLE_SAMPLE: process.env.SOURCE_AUDIT_ARTICLE_SAMPLE || "1"
  }
});
process.exit(audit.status || 0);
