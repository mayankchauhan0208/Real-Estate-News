import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const summary = JSON.parse(await fs.readFile(path.join(root, "reports", "source-audits", "targeted", "classification-evaluation-summary.json"), "utf8"));

assert.equal(summary.rera.sampleSize, 56);
assert.equal(summary.rera.matrix.validAndPass, 0);
assert.equal(summary.rera.matrix.invalidAndPass, 1);
assert.equal(summary.regional.sampleSize, 8);
assert.equal(summary.regional.matrix.validAndPass, 0);
console.log("Classification evaluation regression fixtures passed.");
