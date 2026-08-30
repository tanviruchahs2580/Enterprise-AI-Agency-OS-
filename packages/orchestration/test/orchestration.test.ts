import { test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { SqliteDriver, migrate, Db, genId } from "@agency/db";
import { TaskService } from "../src/tasks.ts";
import { canTransition, assertTransition } from "../src/statemachine.ts";
import { JobQueue } from "../src/jobs.ts";
import { AgentRegistry } from "../src/registry.ts";
import { WorkflowEngine, defaultWorkflowDefinition } from "../src/workflow.ts";
import { ProcessSandbox } from "../src/sandbox.ts";
import { AppError } from "@agency/core";

let driver: SqliteDriver;
let db: Db;
let orgId: string;
let projectId: string;

beforeEach(() => {
  driver = new SqliteDriver(":memory:");
  db = new Db(driver);
  migrate(driver);
  const now = db.now();
  orgId = genId("org");
  projectId = genId("prj");
  db.insert("organizations", { id: orgId, name: "T", slug: "t", created_at: now, updated_at: now });
  db.insert("projects", {
    id: projectId, org_id: orgId, name: "P", slug: "p",
    created_by: genId("usr"), created_at: now, updated_at: now,
  });
});

afterEach(() => {
  driver.close();
});

test("state machine rejects illegal transitions", () => {
  assert.ok(canTransition("draft", "ready"));
  assert.ok(!canTransition("draft", "completed"));
  assert.throws(() => assertTransition("completed", "in_progress"), AppError);
});

test("task graph: dependencies + cycle rejection + ready queue", () => {
  const tasks = new TaskService(db);
  const a = tasks.create({ orgId, projectId, title: "A", createdBy: "u" }).id;
  const b = tasks.create({ orgId, projectId, title: "B", createdBy: "u", dependsOn: [a] }).id;

  // cycle: A depends on B (B already depends on A)
  assert.throws(() => tasks.addDependency(a, b), /cycle/);
  assert.throws(() => tasks.addDependency(a, a), /itself/);

  let ready = tasks.readyQueue(projectId).map((t) => String(t.id));
  assert.deepEqual(ready, [a]); // b blocked by a

  tasks.transition(a, "ready");
  tasks.transition(a, "planned");
  tasks.transition(a, "in_progress");
  tasks.transition(a, "review");
  tasks.transition(a, "qa");
  tasks.transition(a, "security");
  tasks.transition(a, "approval");
  tasks.transition(a, "deploying");
  tasks.transition(a, "deployed");
  tasks.transition(a, "monitoring");
  tasks.transition(a, "completed");

  ready = tasks.readyQueue(projectId).map((t) => String(t.id));
  assert.deepEqual(ready, [b]);
});

test("quality receipt is verifiable and stable", () => {
  const tasks = new TaskService(db);
  const t = tasks.create({ orgId, projectId, title: "T", createdBy: "u" }).id;
  const r1 = tasks.issueQualityReceipt(t, {
    tests: "passed", security: "passed", review: "passed",
    coverageLine: 85, coverageBranch: 70, commit: "abc123",
  });
  const row = db.get<{ quality_receipt: string }>("SELECT quality_receipt FROM tasks WHERE id = ?", [t]);
  const stored = JSON.parse(String(row!.quality_receipt));
  assert.equal(stored.hash, r1.hash);
  assert.equal(stored.tests, "passed");
});

test("job queue: idempotency, retry with backoff, dead-letter, requeue", async () => {
  const q = new JobQueue(db, { pollMs: 10 });
  let attempts = 0;
  q.register("flaky", async () => {
    attempts++;
    throw new Error(`boom-${attempts}`);
  });
  q.register("ok", async () => { /* success */ });

  const j1 = q.enqueue({ orgId, type: "ok", data: {}, idempotencyKey: "idem-1" });
  const j1b = q.enqueue({ orgId, type: "ok", data: {}, idempotencyKey: "idem-1" });
  assert.equal(j1.id, j1b.id);

  await q.processOne();
  const doneRow = db.get<{ status?: string }>("SELECT status FROM jobs WHERE id = ?", [j1.id]);
  assert.equal(String(doneRow!.status), "succeeded");

  // flaky job fails → backoff pending
  const j2 = q.enqueue({ orgId, type: "flaky", data: {}, maxAttempts: 2 });
  await q.processOne();
  let row = db.get<{ status?: string; last_error?: string | null }>("SELECT status, last_error FROM jobs WHERE id = ?", [j2.id]);
  assert.equal(String(row!.status), "pending"); // retried later
  assert.match(String(row!.last_error), /boom-1/);

  // force due and fail again → dead_letter
  driver.run("UPDATE jobs SET run_after = ? WHERE id = ?", [db.now(), j2.id]);
  await q.processOne();
  row = db.get<{ status?: string }>("SELECT status FROM jobs WHERE id = ?", [j2.id]);
  assert.equal(String(row!.status), "dead_letter");

  // requeue from DLQ works
  q.retryDeadLetter(j2.id);
  row = db.get<{ status?: string; attempts?: number }>("SELECT status, attempts FROM jobs WHERE id = ?", [j2.id]);
  assert.equal(String(row!.status), "pending");
});

test("sandbox screens destructive commands before execution", async () => {
  const s = new ProcessSandbox();
  await assert.rejects(
    () => s.exec(["sh", "-c", "rm -rf /"], { cwd: "." }),
    /destructive command blocked/
  );
  const res = await s.exec(["node", "-e", "console.log('safe')"], { cwd: ".", timeoutMs: 15000 });
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /safe/);
});

test("agent roster seeds once; registry heartbeats", () => {
  const reg = new AgentRegistry(db);
  const first = reg.seedRoster(orgId);
  const second = reg.seedRoster(orgId);
  assert.equal(first, 24);
  assert.equal(second, 0);
  const list = reg.list(orgId);
  assert.equal(list.length, 24);
  const captain = list.find((a) => a.name === "captain")!;
  reg.heartbeat(orgId, String(captain.id));
  reg.setStatus(orgId, String(captain.id), "busy");
  const after = db.get<{ status: string }>("SELECT status FROM agents WHERE id = ?", [captain.id]);
  assert.equal(String(after!.status), "busy");
});

test("workflow engine runs all stages, checkpoints, and completes", async () => {
  const engine = new WorkflowEngine(db);
  const defn = defaultWorkflowDefinition();
  for (const stage of defn.stages) {
    engine.registerHandler(defn.name, stage.name, async (_s, state) => ({
      [`out_${_s}`]: `done:${Object.keys(state).length}`,
    }));
  }
  const run = engine.start(orgId, { projectId });
  for (let i = 0; i < defn.stages.length; i++) {
    const r = await engine.advance(run.runId);
    if (i < defn.stages.length - 1) {
      assert.equal(r.status, "running");
      assert.equal(r.currentStage, defn.stages[i + 1]!.name);
    } else {
      assert.equal(r.status, "succeeded");
      assert.equal(r.currentStage, null);
    }
  }
  const state = engine.getState(orgId, run.runId);
  const parsed = JSON.parse(String(state.state_json)) as Record<string, unknown>;
  assert.ok(Array.isArray(parsed.completedStages));
  assert.equal((parsed.completedStages as string[]).length, defn.stages.length);
});

test("workflow without handler blocks; resume after fix continues", async () => {
  const engine = new WorkflowEngine(db);
  const defn = defaultWorkflowDefinition();
  engine.registerHandler(defn.name, "discovery", async () => ({ out: 1 }));
  const run = engine.start(orgId, { definition: defn });
  await engine.advance(run.runId); // discovery ok

  // requirements has no handler yet → blocked
  await assert.rejects(() => engine.advance(run.runId), /no handler/);
  const state = engine.getState(orgId, run.runId);
  assert.equal(String(state.status), "blocked");

  // handler appears; resume continues from requirements
  engine.registerHandler(defn.name, "requirements", async () => ({ reqs: true }));
  engine.resume(run.runId);
  const r = await engine.advance(run.runId);
  assert.equal(r.status, "running");
  assert.equal(r.currentStage, "architecture");
});

// ---------------------------------------------------------------------------
// Production hardening regressions (v0.2.0)
// ---------------------------------------------------------------------------

test("G-04: stale running jobs are reclaimed; fresh locks untouched", async () => {
  const q = new JobQueue(db, { pollMs: 5 });
  const past = new Date(Date.now() - 30 * 60_000).toISOString();
  const fresh = db.now();
  driver.run(
    `INSERT INTO jobs (id, org_id, queue, job_type, payload, status, run_after, attempts, max_attempts, locked_by, locked_at, created_at, updated_at)
     VALUES ('job_old', ?, 'default', 'noop', '{}', 'running', ?, 1, 5, 'dead-worker', ?, ?, ?)`,
    [orgId, fresh, past, fresh, fresh]
  );
  driver.run(
    `INSERT INTO jobs (id, org_id, queue, job_type, payload, status, run_after, attempts, max_attempts, locked_by, locked_at, created_at, updated_at)
     VALUES ('job_fresh', ?, 'default', 'noop', '{}', 'running', ?, 1, 5, 'live-worker', ?, ?, ?)`,
    [orgId, fresh, fresh, fresh, fresh]
  );

  const reclaimed = q.reclaimStale(10 * 60_000);
  assert.equal(reclaimed, 1);
  const oldRow = db.get<{ status: string }>("SELECT status FROM jobs WHERE id='job_old'");
  const freshRow = db.get<{ status: string }>("SELECT status FROM jobs WHERE id='job_fresh'");
  assert.equal(String(oldRow!.status), "pending");
  assert.equal(String(freshRow!.status), "running");
});

test("G-05: parallel workers cannot claim the same job (no double execution)", async () => {
  const q = new JobQueue(db, { pollMs: 5 });
  let executions = 0;
  q.register("counted", async () => {
    executions++;
    await new Promise((r) => setTimeout(r, 20)); // widen the race window
  });
  for (let i = 0; i < 8; i++) {
    q.enqueue({ orgId, type: "counted", data: { n: i } });
  }
  // two workers racing on the same queue
  await Promise.all([q.processOne(), q.processOne(), q.processOne(), q.processOne()]);
  while (await q.processOne()) { /* drain */ }
  assert.equal(executions, 8); // exactly once each — never duplicated
  const dupes = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM jobs WHERE status='succeeded'"
  );
  assert.equal(Number(dupes!.n), 8);
});

test("G-05b: high-concurrency claim proof (12 workers × 24 jobs)", async () => {
  const q = new JobQueue(db, { pollMs: 2 });
  let executions = 0;
  q.register("bulk", async () => {
    executions++;
    await new Promise((r) => setTimeout(r, 5));
  });
  for (let i = 0; i < 24; i++) {
    q.enqueue({ orgId, type: "bulk", data: { i } });
  }
  // simulate 12 concurrent workers repeatedly pulling
  async function worker(): Promise<void> {
    while (await q.processOne()) {
      /* keep pulling */
    }
  }
  await Promise.all(Array.from({ length: 12 }, () => worker()));
  assert.equal(executions, 24);
});
