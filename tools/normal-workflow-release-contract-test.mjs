import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const workflowPath = new URL("../.github/workflows/news-pusher.yml", import.meta.url);
const workflow = fs.readFileSync(workflowPath, "utf8");
const dispatchStart = workflow.indexOf("  workflow_dispatch:");
const concurrencyStart = workflow.indexOf("concurrency:");

assert.ok(dispatchStart >= 0, "workflow_dispatch must be configured");
assert.ok(concurrencyStart > dispatchStart, "workflow dispatch inputs must precede concurrency");
assert.match(workflow, /- cron: "3,8,13,18,23,28,33,38,43,48,53,58 \* \* \* \*"/, "scheduler must provide twelve off-peak hourly delivery opportunities");
assert.match(workflow, /repository_dispatch:\s*\r?\n\s+types: \[hourly-news-ingestion\]/, "a trusted external hourly dispatcher must share the normal workflow");
assert.match(workflow, /normal-ingestion-heartbeat\.json/, "successful normal runs must persist a scheduler heartbeat");
assert.match(workflow, /normal-hourly-gate:/, "automatic runs must use the durable normal heartbeat gate");
assert.match(workflow, /successful-cycle-started-within-60-minutes/, "a recent successful automatic cycle must suppress redundant schedule deliveries");
assert.match(workflow, /lastSuccessfulNormalCycleStartedAt/, "the cadence must be based on successful cycle start time");
assert.match(workflow, /needs: normal-hourly-gate/, "the production job must wait for the due-cycle decision");
assert.match(workflow, /failed run must never suppress its retry/, "failed automatic runs must remain eligible for the next delivery opportunity");
assert.match(workflow, /let shouldRun = true;/, "missing or stale automatic heartbeats must start eligible");
assert.match(workflow, /if \(eventName !== "workflow_dispatch"\)/, "only automatic events may be suppressed by a fresh heartbeat");
assert.doesNotMatch(workflow, /let shouldRun = eventName === "workflow_dispatch";/, "automatic events must not default to skipped");

const gateMatch = workflow.match(/- name: Admit only a due automatic normal cycle[\s\S]*?node <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/);
assert.ok(gateMatch, "workflow must contain an executable normal-hourly-gate script");

function evaluateHourlyGate(eventName, heartbeat) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "brokket-hourly-gate-"));
  const outputPath = path.join(directory, "github-output.txt");

  try {
    if (heartbeat) {
      fs.mkdirSync(path.join(directory, ".state"));
      fs.writeFileSync(path.join(directory, ".state", "normal-ingestion-heartbeat.json"), JSON.stringify(heartbeat));
    }

    const result = spawnSync(process.execPath, ["-e", gateMatch[1]], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: eventName,
        GITHUB_OUTPUT: outputPath,
      },
    });

    assert.equal(result.status, 0, `hourly gate must execute: ${result.stderr}`);
    return Object.fromEntries(
      fs.readFileSync(outputPath, "utf8").trim().split(/\r?\n/).map((line) => line.split("=", 2)),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const freshHeartbeat = { lastSuccessfulNormalCycleStartedAt: new Date().toISOString() };
const staleHeartbeat = { lastSuccessfulNormalCycleStartedAt: new Date(Date.now() - 61 * 60 * 1000).toISOString() };
assert.equal(evaluateHourlyGate("schedule").should_run, "true", "a missing heartbeat must admit the automatic recovery cycle");
assert.equal(evaluateHourlyGate("schedule", staleHeartbeat).should_run, "true", "a stale heartbeat must admit the automatic recovery cycle");
assert.equal(evaluateHourlyGate("schedule", freshHeartbeat).should_run, "false", "a fresh successful cycle must suppress duplicate automatic work");
assert.equal(evaluateHourlyGate("workflow_dispatch", freshHeartbeat).should_run, "true", "manual validation remains independently runnable");

const dispatchInputs = workflow.slice(dispatchStart, concurrencyStart);
assert.match(dispatchInputs, /mode:\s*\r?\n\s+description:.*\r?\n\s+required: true\r?\n\s+type: choice/s);
assert.match(dispatchInputs, /options:\s*\r?\n\s+- DRY_RUN\s*\r?\n\s+- PRODUCTION/s);
assert.match(dispatchInputs, /default: DRY_RUN/);
assert.doesNotMatch(dispatchInputs, /^\s+(backfill_from|backfill_to|resend_backfill):/m);

assert.match(workflow, /^\s+RUN_MODE: NORMAL_CURRENT$/m);
assert.match(workflow, /^\s+BACKFILL_MODE: "false"$/m);
assert.match(workflow, /^\s+BACKFILL_FROM: ""$/m);
assert.match(workflow, /^\s+BACKFILL_TO: ""$/m);
assert.match(workflow, /^\s+RESEND_BACKFILL: "false"$/m);
assert.match(workflow, /DRY_RUN: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.mode == 'DRY_RUN' && 'true' \|\| 'false' \}\}/);
assert.match(workflow, /- name: Verify production history endpoint/);
assert.match(workflow, /https:\/\/api\.propertymaster\.com\/api\/news\/list/);

const fetchStepStart = workflow.indexOf("      - name: Fetch and push news");
const fetchStepEnd = workflow.indexOf("      - name: Persist scheduler checkpoint", fetchStepStart);
assert.ok(fetchStepStart >= 0 && fetchStepEnd > fetchStepStart, "fetch step must be present before state persistence");
const fetchStep = workflow.slice(fetchStepStart, fetchStepEnd);
for (const variable of ["APP_API_URL", "APP_API_KEY", "APP_LIST_API_URL", "APP_LIST_API_KEY", "GITHUB_TOKEN"]) {
  const line = fetchStep.split(/\r?\n/).find((candidate) => candidate.trimStart().startsWith(`${variable}:`));
  assert.ok(line, `${variable} must be configured`);
  if (variable === "APP_API_KEY" || variable === "APP_LIST_API_KEY") {
    assert.match(line, /""/, `${variable} must remain empty for the verified tokenless API contract`);
  } else {
  assert.match(line, /github\.event_name != 'workflow_dispatch'.*github\.event\.inputs\.mode == 'PRODUCTION'/, `${variable} must be withheld from manual dry runs`);
  }
}

const protectedStateGate = "if: ${{ always() && (github.event_name != 'workflow_dispatch' || github.event.inputs.mode == 'PRODUCTION') }}";
assert.equal((workflow.match(new RegExp(protectedStateGate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 2);
assert.match(workflow, /- name: Upload run report\s*\r?\n\s+if: always\(\)/);

console.log("NORMAL_WORKFLOW_RELEASE_CONTRACT=PASS");
