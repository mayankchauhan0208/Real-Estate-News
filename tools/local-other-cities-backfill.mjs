import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const pushMode = args.has("--push") || ["1", "true", "yes", "on"].includes(String(process.env.LOCAL_BACKFILL_PUSH || "").toLowerCase());
const today = new Date();
const start = new Date(today);
start.setDate(start.getDate() - 30);

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

const env = {
  ...process.env,
  DRY_RUN: pushMode ? "false" : "true",
  ENABLED_CITY_CODES: "all",
  DISABLED_CITY_CODES: "noida,gurugram,faridabad",
  TARGET_CITY_CODES: "",
  BACKFILL_FROM: process.env.BACKFILL_FROM || isoDate(start),
  BACKFILL_TO: process.env.BACKFILL_TO || isoDate(today),
  RESEND_BACKFILL: "false",
  ENABLE_NOIDA_CITY: "true",
  ALLOW_NOIDA_API: "false",
  MAX_ITEMS_PER_SOURCE: process.env.MAX_ITEMS_PER_SOURCE || "12",
  MAX_PAGES_PER_SOURCE: process.env.MAX_PAGES_PER_SOURCE || "2",
  MAX_ITEMS_PER_RUN: process.env.MAX_ITEMS_PER_RUN || "120",
  SOURCE_CONCURRENCY: process.env.SOURCE_CONCURRENCY || "14",
  ARTICLE_METADATA_CONCURRENCY: process.env.ARTICLE_METADATA_CONCURRENCY || "6",
  SOURCE_STRATEGY: "local-30d-other-cities",
  BUILD_VERSION: "local-30d-other-cities"
};

if (!pushMode) {
  env.APP_API_URL = "";
  env.APP_API_KEY = "";
}

console.log("Local other-cities 30-day backfill");
console.log(`Mode: ${pushMode ? "API push" : "dry run only"}`);
console.log(`Date window: ${env.BACKFILL_FROM} to ${env.BACKFILL_TO}`);
console.log(`Enabled: all cities except ${env.DISABLED_CITY_CODES}`);
console.log("Dedupe: on; RESEND_BACKFILL=false");
if (!pushMode) console.log("No API push will happen. Add --push only after reviewing dry-run quality.");

const child = spawn("npm", ["start"], {
  stdio: "inherit",
  shell: true,
  env
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Backfill stopped by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
