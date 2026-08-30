import { test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { SqliteDriver, migrate, Db, genId } from "@agency/db";
import { WorkflowEngine, WorkflowTemplateRegistry, defaultWorkflowDefinition } from "@agency/orchestration";
import type { WorkflowDefinition, RiskTier } from "@agency/orchestration";

let driver: SqliteDriver;
let db: Db;
let engine: WorkflowEngine;
let orgId = "";

function define(runs: WorkflowDefinition, riskTier?: RiskTier): { runId: string; workflow: string; currentStage: string } {
  return engine.start(orgId, { definition: runs, riskTier });
}

beforeEach(() => {
  driver = new SqliteDriver(":memory:");
  db = new Db(driver);
  migrate(db.driver);
  engine = new WorkflowEngine(db);
  orgId = genId("org");
  const now = db.now();
  db.insert("organizations", { id: orgId, name: "T", slug: "t", created_at: now, updated_at: now });
});

afterEach(() => {
  driver.close();
});

test("workflow low-risk run skips stages flagged lowRiskSkip (audit Phase 2.2)", async () => {
  engine.registerHandler("t", "alpha", async () => ({ a: 1 }));
  engine.registerHandler("t", "omega", async () => ({ z: 1 }));
  const defn: WorkflowDefinition = {
    name: "t",
    stages: [
      { name: "alpha" },
      { name: "skipme", lowRiskSkip: true },
      { name: "omega" },
    ],
  };
  const { runId } = define(defn, "low");
  const r1 = await engine.advance(runId); // alpha -> next is skipme
  assert.equal(r1.currentStage, "skipme");
  const r2 = await engine.advance(runId); // skipme auto-skipped, omega runs -> succeeded
  assert.equal(r2.status, "succeeded");
  assert.equal(r2.currentStage, null);
  const row = engine.getState(orgId, runId);
  const state = JSON.parse(String(row.state_json)) as { completedStages: string[] };
  assert.deepEqual(state.completedStages, ["alpha", "skipme", "omega"]);
});

test("medium-risk run does NOT skip lowRiskSkip stages", async () => {
  engine.registerHandler("t", "alpha", async () => ({}));
  engine.registerHandler("t", "skipme", async () => ({}));
  engine.registerHandler("t", "omega", async () => ({}));
  const defn: WorkflowDefinition = {
    name: "t",
    stages: [
      { name: "alpha" },
      { name: "skipme", lowRiskSkip: true },
      { name: "omega" },
    ],
  };
  const { runId } = define(defn, "medium");
  const r1 = await engine.advance(runId); // alpha -> next is skipme
  assert.equal(r1.currentStage, "skipme"); // NOT auto-skipped at medium risk
  const r2 = await engine.advance(runId); // skipme handler executes at medium risk
  assert.equal(r2.currentStage, "omega");
  const r3 = await engine.advance(runId); // omega -> succeeded
  assert.equal(r3.status, "succeeded");
});

test("all-lowRiskSkip run completes immediately on advance", async () => {
  const defn: WorkflowDefinition = {
    name: "t",
    stages: [{ name: "alpha", lowRiskSkip: true }, { name: "beta", lowRiskSkip: true }],
  };
  const { runId } = define(defn, "low");
  const r1 = await engine.advance(runId);
  assert.equal(r1.status, "succeeded");
  assert.equal(r1.currentStage, null);
});

test("template registry loads shipped workflow templates without issues", () => {
  const reg = new WorkflowTemplateRegistry(engine, { mode: "strict" }).load();
  const names = reg.list().map((d) => d.name);
  assert.ok(names.includes("enterprise-feature") === false); // enterprise-feature is the built-in default
  assert.ok(names.includes("hotfix"), names.join(","));
  assert.ok(names.includes("dependency-patch"), names.join(","));
  assert.ok(names.includes("research-spike"), names.join(","));
  assert.deepEqual(reg.issues, []);
  const dep = reg.get("dependency-patch");
  assert.ok(dep.stages.some((s) => s.lowRiskSkip === true));
});

test("template registry get on unknown name throws NOT_FOUND", () => {
  const reg = new WorkflowTemplateRegistry(engine).load();
  assert.throws(() => reg.get("nope"), /not registered/);
});

test("fan-out stage runs branches concurrently and converges (audit Phase 3.2)", async () => {
  const timeline: { branch: string; at: number }[] = [];
  let t = 0;
  engine.registerHandler("t", "alpha", async () => ({ a: 1 }));
  engine.registerHandler("t", "branch-a", async () => {
    timeline.push({ branch: "a", at: t++ });
    await new Promise((r) => setTimeout(r, 30));
    return { x: 1 };
  });
  engine.registerHandler("t", "branch-b", async () => {
    timeline.push({ branch: "b", at: t++ });
    await new Promise((r) => setTimeout(r, 30));
    return { y: 2 };
  });
  engine.registerHandler("t", "omega", async () => ({ z: 1 }));
  const defn: WorkflowDefinition = {
    name: "t",
    stages: [
      { name: "alpha" },
      {
        name: "gather",
        fanOut: [{ name: "branch-a" }, { name: "branch-b" }],
      },
      { name: "omega" },
    ],
  };
  const { runId } = define(defn);
  const r1 = await engine.advance(runId); // alpha -> gather (fan-out)
  assert.equal(r1.currentStage, "gather");
  const r2 = await engine.advance(runId); // gather fans out, converges -> omega
  assert.equal(r2.currentStage, "omega");
  assert.equal(timeline.length, 2);
  // both branches were in flight at the same time (start order differs, not serial)
  assert.notEqual(timeline[0]!.branch, timeline[1]!.branch);
  const r3 = await engine.advance(runId); // omega -> succeeded
  assert.equal(r3.status, "succeeded");
  const row = engine.getState(orgId, runId);
  const state = JSON.parse(String(row.state_json)) as {
    completedStages: string[];
    gather: Record<string, Record<string, unknown>>;
  };
  assert.deepEqual(state.gather["branch-a"], { x: 1 });
  assert.deepEqual(state.gather["branch-b"], { y: 2 });
  assert.deepEqual(state.completedStages, ["alpha", "branch-a", "branch-b", "gather", "omega"]);
});

test("fan-out converges into a stage then run completes when it is the final stage", async () => {
  engine.registerHandler("t", "one", async () => ({ o: 1 }));
  engine.registerHandler("t", "two", async () => ({ w: 2 }));
  engine.registerHandler("t", "prereq", async () => ({}));
  const defn: WorkflowDefinition = {
    name: "t",
    stages: [
      { name: "prereq" },
      { name: "collect", fanOut: [{ name: "one" }, { name: "two" }] },
    ],
  };
  const { runId } = define(defn);
  await engine.advance(runId); // prereq -> collect
  const done = await engine.advance(runId); // fan-out final stage -> succeeded
  assert.equal(done.status, "succeeded");
  assert.equal(done.currentStage, null);
});

test("a failing fan-out branch fails the whole run without a partial checkpoint", async () => {
  engine.registerHandler("t", "ok", async () => ({ o: 1 }));
  engine.registerHandler("t", "boom", async () => {
    throw new Error("branch exploded");
  });
  engine.registerHandler("t", "never", async () => ({ n: 1 }));
  const defn: WorkflowDefinition = {
    name: "t",
    stages: [{ name: "fan", fanOut: [{ name: "ok" }, { name: "boom" }] }, { name: "never" }],
  };
  const { runId } = define(defn);
  await assert.rejects(() => engine.advance(runId), /branch 'boom' \(fan-out 'fan'\) failed/);
  const row = engine.getState(orgId, runId);
  assert.equal(row.status, "failed");
  const state = JSON.parse(String(row.state_json)) as { completedStages: string[] };
  // the fan-out stage was never persisted as completed
  assert.ok(!state.completedStages.includes("fan"));
});

// ---- mutation-testing hardening (kills surviving Stryker mutants) ----

test("advance on an unknown run rejects NOT_FOUND", () => {
  assert.rejects(() => engine.advance("wfr_nope"), /not found/);
});

test("getState is org-scoped: unknown run or mismatched org rejects NOT_FOUND", () => {
  assert.throws(() => engine.getState("org_nope", "wfr_x"), /not found/);
  const { runId } = define({ name: "t", stages: [{ name: "alpha" }] });
  assert.throws(() => engine.getState("org_other", runId), /not found/);
});

test("running run cannot be resumed; paused run can", () => {
  engine.registerHandler("t", "alpha", async () => ({}));
  const { runId } = define({ name: "t", stages: [{ name: "alpha" }] });
  assert.throws(() => engine.resume(runId), /cannot resume run in status running/);
});

test("advance without a registered handler marks the run blocked (DEPENDENCY_UNAVAILABLE)", () => {
  const { runId } = define({ name: "unhandled", stages: [{ name: "stage-a" }] });
  assert.rejects(() => engine.advance(runId), /no handler registered/);
  assert.equal(engine.getState(orgId, runId).status, "blocked");
});

test("defaultWorkflowDefinition returns a fresh detached copy", () => {
  const a = defaultWorkflowDefinition();
  const b = defaultWorkflowDefinition();
  assert.notEqual(a, b);
  assert.equal(a.name, "enterprise-feature");
  assert.equal(a.stages.length, 10);
  a.stages.pop();
  assert.equal(defaultWorkflowDefinition().stages.length, 10);
});

test("parseDefinition rejects malformed workflow definitions", () => {
  assert.throws(() => engine.parseDefinition("workflow:\n  name: x\n"), /stage/);
  assert.throws(() => engine.parseDefinition("workflow:\n  name: x\n  stages: []\n"), /stage/);
  const ok = engine.parseDefinition("workflow:\n  name: x\n  stages:\n    - name: a\n    - name: b\n");
  assert.equal(ok.stages.length, 2);
});

test("pauseForApproval + resume persists pendingApproval for review and survives resume", () => {
  engine.registerHandler("t", "stage", async () => ({}));
  const { runId } = define({ name: "t", stages: [{ name: "stage" }] });
  engine.pauseForApproval(runId, "deploy:staging", { env: "prod" });
  const paused = engine.getState(orgId, runId);
  assert.equal(paused.status, "waiting_approval");
  const ps = JSON.parse(String(paused.state_json)) as { pendingApproval?: Record<string, unknown> };
  assert.equal(ps.pendingApproval?.action, "deploy:staging");
  const resumed = engine.resume(runId);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.currentStage, "stage");
});