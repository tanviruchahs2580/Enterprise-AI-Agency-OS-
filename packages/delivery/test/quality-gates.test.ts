import { test } from "node:test";
import { strict as assert } from "node:assert";
import { QUALITY_GATES, gatesForPhase } from "../src/quality-gates.ts";

test("PHASE 44: all four quality gates defined with checks + evidence + fail-closed", () => {
  const ids = Object.keys(QUALITY_GATES);
  assert.deepEqual(ids.sort(), ["IMPLEMENTATION_READY", "QA_READY", "RELEASE_READY", "SECURITY_READY"].sort());
  for (const gate of Object.values(QUALITY_GATES)) {
    assert.ok(gate.entryCriteria.length > 0, `${gate.id} entry criteria`);
    assert.ok(gate.checks.length > 0, `${gate.id} checks`);
    assert.ok(gate.evidenceRequired.length > 0, `${gate.id} evidence`);
    assert.equal(gate.failureAction, "BLOCK", `${gate.id} must be fail-closed`);
  }
});

test("PHASE 44: phase→gate mapping returns correct sets", () => {
  assert.equal(gatesForPhase("dispatch").length, 1);
  assert.equal(gatesForPhase("review").length, 2);
  assert.equal(gatesForPhase("merge").length, 1);
  assert.equal(gatesForPhase("nonexistent").length, 0);
});
