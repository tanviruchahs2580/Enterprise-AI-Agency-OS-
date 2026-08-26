import { test } from "node:test";
import { strict as assert } from "node:assert";
import { evaluateGovernance } from "../src/governance.ts";

const base = {
  taskStatus: "ready",
  orgIdMatches: true,
  impactMode: "create" as const,
  opsCount: 2,
  budgetCheck: { allowed: true },
};

test("B1 happy path: computed ALLOW payload carries real values", () => {
  const d = evaluateGovernance(base);
  assert.equal(d.decision, "ALLOW");
  assert.equal(d.complexity, "simple");
  assert.equal(d.riskLevel, "low");
  assert.equal(d.requiresApproval, false);
  assert.deepEqual(d.reasons, []);
});

test("B1 over-budget org blocks even for $0 deterministic engine", () => {
  const d = evaluateGovernance({
    ...base,
    budgetCheck: { allowed: false, violatedScope: "daily:*", limitUsd: 25, spentUsd: 25.01 },
  });
  assert.equal(d.decision, "BLOCK");
  assert.ok(d.reasons.some((r) => /daily:\*/.test(r) && /25\.01\/25/.test(r)));
});

test("B1 modify-mode raises risk to medium", () => {
  const d = evaluateGovernance({ ...base, impactMode: "modify" });
  assert.equal(d.riskLevel, "medium");
  assert.equal(d.decision, "ALLOW"); // risk alone doesn't block
});

test("B1 service complexity (>8 ops) requires human approval and blocks", () => {
  const d = evaluateGovernance({ ...base, opsCount: 9 });
  assert.equal(d.complexity, "service");
  assert.equal(d.requiresApproval, true);
  assert.equal(d.decision, "BLOCK");
  assert.ok(d.reasons.some((r) => /human approval \(delivery:auto\)/.test(r)));
});

test("B1 non-ready status blocks with clear reason; ownership mismatch blocks first", () => {
  const notReady = evaluateGovernance({ ...base, taskStatus: "draft" });
  assert.equal(notReady.decision, "BLOCK");
  assert.ok(notReady.reasons[0]!.includes("draft"));

  const foreign = evaluateGovernance({ ...base, orgIdMatches: false });
  assert.equal(foreign.decision, "BLOCK");
  assert.match(foreign.reasons[0]!, /organization/);
});
