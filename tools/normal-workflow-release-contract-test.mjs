import assert from "node:assert/strict";
import fs from "node:fs";

const workflowPath = new URL("../.github/workflows/news-pusher.yml", import.meta.url);
const workflow = fs.readFileSync(workflowPath, "utf8");
const dispatchStart = workflow.indexOf("  workflow_dispatch:");
const concurrencyStart = workflow.indexOf("concurrency:");

assert.ok(dispatchStart >= 0, "workflow_dispatch must be configured");
assert.ok(concurrencyStart > dispatchStart, "workflow dispatch inputs must precede concurrency");
assert.match(workflow, /- cron: "3,18,33,48 \* \* \* \*"/, "scheduler must provide four off-peak hourly delivery opportunities");
assert.match(workflow, /repository_dispatch:\s*\r?\n\s+types: \[hourly-news-ingestion\]/, "a trusted external hourly dispatcher must share the normal workflow");
assert.match(workflow, /normal-ingestion-heartbeat\.json/, "successful normal runs must persist a scheduler heartbeat");
assert.match(workflow, /normal-hourly-gate:/, "automatic runs must use the durable normal heartbeat gate");
assert.match(workflow, /successful-cycle-within-50-minutes/, "a recent successful automatic cycle must suppress redundant schedule deliveries");
assert.match(workflow, /needs: normal-hourly-gate/, "the production job must wait for the due-cycle decision");
assert.match(workflow, /failed run must never suppress its retry/, "failed automatic runs must remain eligible for the next delivery opportunity");

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
