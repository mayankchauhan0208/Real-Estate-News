import assert from "node:assert/strict";

const names = [
  "RUN_MODE",
  "BACKFILL_MODE",
  "BACKFILL_FROM",
  "BACKFILL_TO",
  "DEFAULT_LOOKBACK_DAYS"
];
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));

const {
  assertRunModeContract,
  getBackfillDateRange,
  getCurrentNewsFreshnessRange,
  getRunMode,
  hasBackfillDateRange
} = await import("../src/index.js");

function clearInputs() {
  for (const name of names) delete process.env[name];
}

function restoreInputs() {
  clearInputs();
  for (const [name, value] of Object.entries(saved)) {
    if (value !== undefined) process.env[name] = value;
  }
}

try {
  clearInputs();
  process.env.RUN_MODE = "NORMAL_CURRENT";
  process.env.DEFAULT_LOOKBACK_DAYS = "20";
  assert.equal(getRunMode(), "NORMAL_CURRENT");
  assert.deepEqual(getBackfillDateRange(), { from: null, to: null });
  assert.equal(hasBackfillDateRange(getBackfillDateRange()), false);
  const freshness = getCurrentNewsFreshnessRange(new Date("2026-10-06T00:00:00.000Z"));
  assert.equal(freshness.from.toISOString(), "2026-09-16T00:00:00.000Z");
  assert.equal(freshness.to.toISOString(), "2026-10-06T00:00:00.000Z");
  assert.doesNotThrow(() => assertRunModeContract("NORMAL_CURRENT", { from: null, to: null }));
  console.log("TEST_A_SCHEDULED_NORMAL=PASS");

  clearInputs();
  process.env.RUN_MODE = "NORMAL_CURRENT";
  assert.equal(getRunMode(), "NORMAL_CURRENT");
  assert.doesNotThrow(() => assertRunModeContract("NORMAL_CURRENT", { from: null, to: null }));
  console.log("TEST_B_MANUAL_NORMAL=PASS");

  clearInputs();
  process.env.RUN_MODE = "NORMAL_CURRENT";
  process.env.BACKFILL_FROM = "2026-09-01";
  process.env.BACKFILL_TO = "2026-09-30";
  assert.equal(getRunMode(), "NORMAL_CURRENT");
  assert.throws(
    () => assertRunModeContract("NORMAL_CURRENT", getBackfillDateRange()),
    /NORMAL_MODE_HISTORICAL_RANGE_FORBIDDEN/
  );
  console.log("TEST_C_ACCIDENTAL_HISTORICAL_INPUT=PASS");

  clearInputs();
  process.env.RUN_MODE = "NORMAL_CURRENT";
  process.env.DEFAULT_LOOKBACK_DAYS = "7";
  assert.equal(getRunMode(), "NORMAL_CURRENT");
  assert.deepEqual(getBackfillDateRange(), { from: null, to: null });
  assert.equal(
    getCurrentNewsFreshnessRange(new Date("2026-10-06T00:00:00.000Z")).from.toISOString(),
    "2026-09-29T00:00:00.000Z"
  );
  assert.doesNotThrow(() => assertRunModeContract("NORMAL_CURRENT", { from: null, to: null }));
  console.log("TEST_D_NORMAL_FRESHNESS=PASS");

  clearInputs();
  process.env.RUN_MODE = "BACKFILL";
  process.env.BACKFILL_MODE = "true";
  process.env.BACKFILL_FROM = "2026-09-01";
  process.env.BACKFILL_TO = "2026-09-30";
  assert.equal(getRunMode(), "BACKFILL");
  assert.doesNotThrow(() => assertRunModeContract("BACKFILL", getBackfillDateRange()));
  console.log("TEST_E_EXPLICIT_BACKFILL=PASS");
} finally {
  restoreInputs();
}

console.log("NORMAL_MODE_CONTRACT_REGRESSION=PASS");
