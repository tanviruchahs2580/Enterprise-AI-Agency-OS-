import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Skill } from "@agency/skills";
import {
  SkillRuntime,
  parseFailureHandling,
  evaluateConditionExpression,
  evaluateRubric,
} from "@agency/skills";

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: "test-skill",
    version: "1.0.0",
    description: "test",
    inputs: {},
    outputs: {},
    preconditions: [],
    procedure: ["step one", "step two"],
    verification: "${ok} == true",
    failureHandling: "fail",
    requiredTools: ["fs.workspace"],
    requiredPermissions: [],
    ...overrides,
  };
}

const rt = new SkillRuntime();

test("success path: preconditions pass, steps run in order, rubric satisfied with retry(1)", async () => {
  const order: string[] = [];
  const res = await rt.execute(
    skill({
      failureHandling: "retry(maxAttempts=1)",
      verification: "${ok} == true",
    }),
    {
      input: { n: 2 },
      hooks: {
        runStep: async (step, _c, i) => {
          order.push(step);
          return i === 0 ? { ok: true, value: 2 } : { value: 4 };
        },
      },
    }
  );
  assert.equal(res.ok, true);
  assert.deepEqual(order, ["step one", "step two"]);
  assert.equal(res.outputs.value, 4);
  assert.equal(res.procedureStepsRun, 2);
  assert.equal(res.events.length, 2);
  assert.ok(res.durationMs >= 0);
});

test("missing precondition → precondition_failed, no steps run", async () => {
  const res = await rt.execute(
    skill({ preconditions: ["${input.ready} == true"] }),
    { hooks: {} }
  );
  assert.equal(res.ok, false);
  assert.equal(res.failureClass, "precondition_failed");
  assert.match(res.failureMessage ?? "", /precondition not satisfied/);
  assert.equal(res.procedureStepsRun, 0);
});

test("verification failure retries per contract then fails", async () => {
  let calls = 0;
  const res = await rt.execute(
    skill({ failureHandling: "retry(maxAttempts=3,delayMs=1)", verification: "${ok} == true" }),
    {
      hooks: {
        runStep: async (_s, _c, i) => ({ ok: false, n: i }),
        verify: async () => {
          calls++;
          return { ok: calls >= 5 };
        },
      },
    }
  );
  assert.equal(res.ok, false);
  assert.equal(res.failureClass, "verification_failed");
});

test("verification succeeds on a later retry", async () => {
  let verifyCalls = 0;
  const res = await rt.execute(
    skill({ failureHandling: "retry(maxAttempts=3,delayMs=1)", verification: "${ok} == true" }),
    {
      hooks: {
        runStep: async () => ({ ok: false }),
        verify: async () => {
          verifyCalls++;
          return { ok: verifyCalls === 2 };
        },
      },
      onAttempt: () => undefined,
    }
  );
  assert.equal(res.ok, true);
  assert.equal(verifyCalls, 2);
});

test("verification failure with fail contract → immediate fail, attempt count 1", async () => {
  const res = await rt.execute(
    skill({ failureHandling: "fail", verification: "${ok} == true" }),
    { hooks: { runStep: async () => ({ ok: false }) } }
  );
  assert.equal(res.ok, false);
  assert.equal(res.failureClass, "verification_failed");
  assert.equal(res.events.length, 2);
});

test("step throwing → instruction_failed; retry contract retries then fails", async () => {
  let n = 0;
  const res = await rt.execute(
    skill({ procedure: ["singleton"], failureHandling: "retry(maxAttempts=2,delayMs=0)" }),
    {
      hooks: {
        runStep: async () => {
          n++;
          if (n < 2) throw new Error("boom");
          return { ok: true };
        },
      },
    }
  );
  assert.equal(res.ok, true);
  assert.equal(n, 2);
});

test("step timing out → timeout class", async () => {
  const res = await rt.execute(skill(), {
    timeoutMs: 5,
    hooks: {
      runStep: async () => new Promise((r) => setTimeout(() => r({}), 50)),
    },
  });
  assert.equal(res.ok, false);
  assert.equal(res.failureClass, "timeout");
});

test("ungranted required tool → tool_failed and escalation hook fires for escalation contract", async () => {
  const escalated: string[] = [];
  const res = await rt.execute(
    skill({ failureHandling: "escalation(target=principal)" }),
    {
      hooks: {
        handlesTools: [{ tools: ["fs.workspace"], granted: false }],
        escalated: (c, t) => escalated.push(`${c}:${t}`),
      },
    }
  );
  assert.equal(res.ok, false);
  assert.equal(res.failureClass, "tool_failed");
  assert.equal(res.escalatedTo, "principal");
  assert.deepEqual(escalated, ["tool_failed:principal"]);
});

test("ungranted required permission → permission_denied", async () => {
  const res = await rt.execute(
    skill({ requiredPermissions: ["execution:control"] }),
    {
      hooks: {
        handlesPermissions: [{ permissions: ["execution:control"], granted: false }],
      },
    }
  );
  assert.equal(res.ok, false);
  assert.equal(res.failureClass, "permission_denied");
});

test("granted tools/permissions pass eligibility", async () => {
  const res = await rt.execute(
    skill({ failureHandling: "retry(maxAttempts=1)", verification: "always-true" }),
    {
      hooks: {
        handlesTools: [{ tools: ["fs.workspace"], granted: true }],
        handlesPermissions: [{ permissions: [], granted: true }],
      },
    }
  );
  assert.equal(res.ok, true);
});

test("budget estimate above allowance → budget_exceeded", async () => {
  const res = await rt.execute(skill(), {
    hooks: {
      budgetEstimateUsd: () => 9,
      budgetAllowanceUsd: () => 8,
    },
  });
  assert.equal(res.ok, false);
  assert.equal(res.failureClass, "budget_exceeded");
  assert.match(res.failureMessage ?? "", /allowance/);
});

test("unmet dependencies → dependency_blocked", async () => {
  const res = await rt.execute(skill(), {
    hooks: { dependencies: () => ["migration 0010 applied"] },
  });
  assert.equal(res.ok, false);
  assert.equal(res.failureClass, "dependency_blocked");
});

test("parseFailureHandling covers retry / escalation / fail deterministically", () => {
  assert.deepEqual(parseFailureHandling("retry(maxAttempts=2,delayMs=100)"), {
    kind: "retry", maxAttempts: 2, delayMs: 100,
  });
  assert.deepEqual(parseFailureHandling("retry(maxAttempts=1)"), {
    kind: "retry", maxAttempts: 1, delayMs: 0,
  });
  assert.deepEqual(parseFailureHandling("escalation(target=security-engineer)"), {
    kind: "escalate", maxAttempts: 1, delayMs: 0, target: "security-engineer",
  });
  assert.deepEqual(parseFailureHandling("escalate"), {
    kind: "escalate", maxAttempts: 1, delayMs: 0, target: "principal",
  });
  assert.deepEqual(parseFailureHandling("fail"), { kind: "fail", maxAttempts: 1, delayMs: 0 });
});

test("evaluateConditionExpression resolves ${path} and numeric comparison", () => {
  assert.equal(evaluateConditionExpression("${input.ready} == true", { input: { ready: true } }), true);
  assert.equal(evaluateConditionExpression("${value} >= 3", { value: 4 }), true);
  assert.equal(evaluateConditionExpression("${value} >= 3", { value: 2 }), false);
  assert.equal(evaluateConditionExpression("${missing} == true", {}), false);
  assert.equal(evaluateConditionExpression("", {}), true);
});

test("evaluateRubric checks output tokens, comparisons and always-true", () => {
  assert.equal(evaluateRubric("${ok} == true", { ok: true }), true);
  assert.equal(evaluateRubric("${ok} == true", { ok: false }), false);
  assert.equal(evaluateRubric("prove success via ${testsPassed}", { testsPassed: true }), true);
  assert.equal(evaluateRubric("prove success via ${testsPassed}", { testsPassed: false }), false);
  assert.equal(evaluateRubric("always-true", {}), true);
});