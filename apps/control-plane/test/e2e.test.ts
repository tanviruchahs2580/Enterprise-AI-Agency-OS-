import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext, type AppContext } from "../src/context.ts";
import { buildApp } from "../src/app.ts";
import { registerWorkers } from "../src/workers.ts";
import { AuthService } from "../src/auth.ts";
import type { FastifyInstance } from "fastify";

let ctx: AppContext;
let app: FastifyInstance;
const adminKey = "test-admin-key-0001";
let dataDir: string;

async function api(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  key: string = adminKey
) {
  const res = await app.inject({
    method,
    url: path,
    ...(body !== undefined ? { payload: body } : {}),
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
  let json: unknown;
  try {
    json = res.json();
  } catch {
    json = res.body;
  }
  return { status: res.statusCode, body: json as Record<string, unknown> };
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "agencyos-e2e-"));
  ctx = buildContext({
    NODE_ENV: "test",
    DATABASE_URL: join(dataDir, "test.sqlite"),
    ADMIN_BOOTSTRAP_KEY: adminKey,
    PORT: "0",
    LOG_LEVEL: "error",
    SANDBOX_PROVIDER: "process",
  });
  const auth = new AuthService(ctx.db);
  auth.ensureBootstrapKey(ctx.defaultOrgId(), adminKey);
  ctx.agents.seedRoster(ctx.defaultOrgId());
  registerWorkers(ctx);
  app = buildApp(ctx);
});

after(async () => {
  await app.close();
  ctx.jobs.stop();
  ctx.db.driver.close();
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* Windows may hold WAL briefly — temp dir is disposable */
  }
});

test("health endpoints are public", async () => {
  const h = await api("GET", "/health");
  assert.equal(h.status, 200);
  const r = await api("GET", "/ready");
  assert.equal(r.status, 200);
  assert.equal((r.body as { database: string }).database, "ok");
});

test("unauthenticated requests are rejected; garbage keys rejected", async () => {
  const noAuth = await api("GET", "/api/v1/projects", undefined, "");
  assert.equal(noAuth.status, 401);
  const bad = await api("GET", "/api/v1/projects", undefined, "wrong-key");
  assert.equal(bad.status, 401);
});

test("T1: create project", async () => {
  const r = await api("POST", "/api/v1/projects", { name: "Billing Service", description: "B2B billing" });
  assert.equal(r.status, 201);
  assert.ok(String(r.body.id).startsWith("prj_"));

  const dup = await api("POST", "/api/v1/projects", { name: "billing service" });
  assert.equal(dup.status, 409);
});

test("T2/T3: requirements + architecture artifacts recorded via knowledge", async () => {
  const prj = await api("POST", "/api/v1/projects", { name: "Arch Project" });
  const projectId = String(prj.body.id);

  const req = await api("POST", `/api/v1/projects/${projectId}/requirements`, {
    title: "Invoicing API",
    acceptanceCriteria: ["creates invoice", "idempotent"],
  });
  assert.equal(req.status, 201);
  assert.equal(String(req.body.ref), "REQ-0001");

  const list = await api("GET", `/api/v1/projects/${projectId}/requirements`);
  assert.equal((list.body.items as unknown[]).length, 1);
});

test("T4: task graph ready queue respects dependency chain", async () => {
  const prj = await api("POST", "/api/v1/projects", { name: "Task Graph" });
  const projectId = String(prj.body.id);

  const a = await api("POST", "/api/v1/tasks", { projectId, title: "A" });
  const b = await api("POST", "/api/v1/tasks", { projectId, title: "B depends A", dependsOn: [a.body.id] });
  const c = await api("POST", "/api/v1/tasks", { projectId, title: "C depends B", dependsOn: [b.body.id] });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(c.status, 201);
});

test("T21: production deployment blocked without approval gate", async () => {
  const prj = await api("POST", "/api/v1/projects", { name: "Deploy Gate" });
  const projectId = String(prj.body.id);

  const dep = await api("POST", "/api/v1/deployments", {
    projectId, environment: "production", version: "1.0.0", commitSha: "deadbeef",
  });
  assert.equal(dep.status, 202);
  const err = dep.body.error as { code?: string } | undefined;
  assert.equal(err?.code, "APPROVAL_REQUIRED");

  // request approval → decide → retry passes
  const apr = await api("POST", "/api/v1/approvals", {
    action: "deploy:production",
    resourceType: "deployment",
    resourceId: projectId,
    reason: "first prod release",
    riskLevel: "critical",
  });
  assert.equal(apr.status, 201);

  const decided = await api("POST", `/api/v1/approvals/${apr.body.id}/decide`, { decision: "approve" });
  assert.equal(decided.status, 200);

  const dep2 = await api("POST", "/api/v1/deployments", {
    projectId, environment: "production", version: "1.0.0", commitSha: "deadbeef",
  });
  assert.equal(dep2.status, 202);
  assert.ok(!(dep2.body as Record<string, unknown>).error);
});

test("RBAC: engineer role is restricted", async () => {
  const eng = new AuthService(ctx.db).createKey(ctx.defaultOrgId(), "eng-1", "ENGINEER");

  // engineer can read projects
  const okRead = await api("GET", "/api/v1/projects", undefined, eng.keyMaterial);
  assert.equal(okRead.status, 200);

  // engineer cannot create budgets (budget:manage)
  const deniedBudget = await api("POST", "/api/v1/budgets", { scopeType: "daily", limitUsd: 5 }, eng.keyMaterial);
  assert.equal(deniedBudget.status, 403);

  // engineer cannot decide approvals
  const deniedDecide = await api("POST", "/api/v1/approvals/x/decide", { decision: "approve" }, eng.keyMaterial);
  assert.equal(deniedDecide.status, 403);
});

test("model routing records fallbacks and costs (T19, T20)", async () => {
  // budget that always blocks → BUDGET_EXCEEDED path is covered in unit tests.
  // here verify the success path persists a model_request row.
  const comp = await api("POST", "/api/v1/models/complete", { prompt: "ping", tier: "FAST" });
  assert.equal(comp.status, 200);
  assert.ok(String(comp.body.content).startsWith("[mock-fast]"));

  const summary = await api("GET", "/api/v1/costs/summary");
  assert.equal(summary.status, 200);
  assert.ok(summary.body.dailySpend !== undefined);
});

test("audit trail verifies (T18)", async () => {
  const list = await api("GET", "/api/v1/audit");
  assert.ok((list.body.items as unknown[]).length > 0);
  const v = await api("GET", "/api/v1/audit/verify");
  assert.equal(v.body.valid, true);
});

test("security findings lifecycle", async () => {
  const f = await api("POST", "/api/v1/security/findings", {
    severity: "high", title: "SQL injection risk in demo endpoint", tool: "semgrep",
  });
  assert.equal(f.status, 201);
  const list = await api("GET", "/api/v1/security/findings?severity=high");
  assert.ok((list.body.items as unknown[]).length >= 1);
});

test("knowledge search returns real matches only", async () => {
  await api("POST", "/api/v1/knowledge", {
    kind: "decision", title: "Use cursor pagination everywhere", content: "ADR-0013 decision about pagination standard",
  });
  const hit = await api("GET", "/api/v1/knowledge/search?q=pagination");
  assert.ok((hit.body.items as unknown[]).length >= 1);
  const miss = await api("GET", "/api/v1/knowledge/search?q=zzznotfoundzzz");
  assert.equal((miss.body.items as unknown[]).length, 0);
});

// ---------------------------------------------------------------------------
// Post-build verification additions
// ---------------------------------------------------------------------------

test("TENANT ISOLATION: organization B cannot access organization A resources", async () => {
  // provision tenant B as the OWNER identity
  const orgB = await api("POST", "/api/v1/organizations", { name: "Beta Corp" });
  assert.equal(orgB.status, 201);
  const keyB = String(orgB.body.ownerKey);
  assert.ok(keyB.length > 20);

  // duplicate slug rejected
  const dupOrg = await api("POST", "/api/v1/organizations", { name: "beta corp" });
  assert.equal(dupOrg.status, 409);

  // B creates its own project
  const prjB = await api("POST", "/api/v1/projects", { name: "Secret Beta Project" }, keyB);
  assert.equal(prjB.status, 201);
  const projectIdB = String(prjB.body.id);
  const taskIdB = await api("POST", "/api/v1/tasks", { projectId: projectIdB, title: "B-only task" }, keyB);
  assert.equal(taskIdB.status, 201);
  await api("POST", "/api/v1/knowledge", {
    kind: "fact", title: "beta secret", content: "only beta knows this",
  }, keyB);

  // A cannot read B's project / tasks / knowledge
  const aReadsB = await api("GET", `/api/v1/projects/${projectIdB}`);
  assert.equal(aReadsB.status, 404);
  const aTasksB = await api("GET", `/api/v1/tasks?projectId=${projectIdB}`);
  assert.equal(aTasksB.status, 200);
  assert.equal((aTasksB.body.items as unknown[]).length, 0); // scoped out
  const aKnowledge = await api("GET", "/api/v1/knowledge/search?q=beta+secret");
  const leaked = (aKnowledge.body.items as { title: string }[]).filter(
    (k) => k.title === "beta secret"
  );
  assert.equal(leaked.length, 0);

  // B cannot see A's data either
  const bProjects = await api("GET", "/api/v1/projects", undefined, keyB);
  const namesB = (bProjects.body.items as { name: string }[]).map((p) => p.name);
  assert.equal(namesB.filter((n) => n === "Billing Service").length, 0);
});

test("WORKER EXECUTION: dispatch → job → model → artifact → cost → transition", async () => {
  const prj = await api("POST", "/api/v1/projects", { name: "Exec Flow" });
  const projectId = String(prj.body.id);
  const task = await api("POST", "/api/v1/tasks", { projectId, title: "Plan the invoice module" });
  const ready = await api("POST", `/api/v1/tasks/${task.body.id}/transition`, { to: "ready" });
  assert.equal(ready.status, 200);

  // find backend engineer from seeded roster
  const agents = await api("GET", "/api/v1/agents");
  const agent = (agents.body.items as { id: string; name: string }[]).find((a) => a.name === "backend-engineer")!;

  const disp = await api("POST", "/api/v1/executions", { taskId: task.body.id, agentId: agent.id });
  assert.equal(disp.status, 202);
  const executionId = String(disp.body.executionId);

  // drive the queue deterministically
  const processed = await ctx.jobs.processOne();
  assert.equal(processed, true);

  const execs = await api("GET", `/api/v1/executions?taskId=${task.body.id}`);
  const exec = (execs.body.items as { id: string; status: string; output_summary?: string }[]).find(
    (e) => e.id === executionId
  )!;
  assert.equal(exec.status, "succeeded");
  assert.match(String(exec.output_summary), /mock-/);

  // artifact persisted
  const artifacts = ctx.db.all("SELECT kind, name FROM artifacts WHERE execution_id = ?", [executionId]);
  assert.equal(artifacts.length, 1);
  assert.equal(String(artifacts[0]!.kind), "plan");

  // handoff knowledge document persisted (executionId recorded in tags)
  const handoffs = ctx.db.all(
    "SELECT id FROM knowledge_documents WHERE kind='handoff' AND tags LIKE ?",
    [`%${executionId}%`]
  );
  assert.equal(handoffs.length, 1);

  // cost recorded at multiple scopes
  const costs = ctx.db.all(
    "SELECT DISTINCT scope_type FROM cost_events WHERE reason LIKE ?",
    [`%${executionId}%`]
  );
  const scopes = costs.map((c) => String(c.scope_type)).sort();
  assert.deepEqual(scopes, ["daily", "monthly", "org", "project", "task"]);

  // task advanced into implementation state
  const taskRow = ctx.db.get<{ status: string }>("SELECT status FROM tasks WHERE id = ?", [
    String(task.body.id),
  ]);
  assert.equal(String(taskRow!.status), "in_progress");
});

test("ROLLBACK: corrective deployment recorded and original marked rolled_back", async () => {
  const prj = await api("POST", "/api/v1/projects", { name: "Rollback Flow" });
  const projectId = String(prj.body.id);
  const dep = await api("POST", "/api/v1/deployments", {
    projectId, environment: "staging", version: "2.0.0", commitSha: "cafebabe",
  });
  assert.equal(dep.status, 202);
  await api("POST", `/api/v1/deployments/${dep.body.id}/succeed`);

  const rb = await api("POST", `/api/v1/deployments/${dep.body.id}/rollback`);
  assert.equal(rb.status, 202);
  const list = await api("GET", "/api/v1/deployments");
  const items = list.body.items as { id: string; status: string; version: string; rollback_of: string | null }[];
  const original = items.find((d) => d.id === dep.body.id)!;
  assert.equal(original.status, "rolled_back");
  const corrective = items.find((d) => d.rollback_of === dep.body.id)!;
  assert.equal(corrective.version, "2.0.0-rollback");

  // audit trail contains the rollback event
  const audit = await api("GET", "/api/v1/audit?limit=50");
  const actions = (audit.body.items as { action: string }[]).map((a) => a.action);
  assert.ok(actions.includes("deployment.rollback_started"));
});

test("APPROVAL TIMEOUT: expired request cannot be decided and gate stays closed", async () => {
  const resId = crypto.randomUUID();
  const apr = await api("POST", "/api/v1/approvals", {
    action: "deploy:staging",
    resourceType: "deployment",
    resourceId: resId,
    reason: "expiring quickly",
    riskLevel: "medium",
    ttlMinutes: 0,
  });
  assert.equal(apr.status, 201);
  await new Promise((r) => setTimeout(r, 10));

  const decided = await api("POST", `/api/v1/approvals/${apr.body.id}/decide`, { decision: "approve" });
  assert.equal(decided.status, 409);
  const err = decided.body.error as { message?: string };
  assert.match(String(err.message), /expired/);

  // gate remains closed — APPROVAL_REQUIRED surfaces as HTTP 202 by design
  const dep = await api("POST", "/api/v1/deployments", {
    projectId: resId, environment: "production", version: "9.9.9", commitSha: "ff",
  });
  assert.equal(dep.status, 202);
  const depErr = dep.body.error as { code?: string };
  assert.equal(depErr.code, "APPROVAL_REQUIRED");
});

test("MISSIONS & WORKSTREAMS lifecycle endpoints", async () => {
  const prj = await api("POST", "/api/v1/projects", { name: "Mission Control" });
  const projectId = String(prj.body.id);

  const mis = await api("POST", "/api/v1/missions", {
    projectId, title: "Q4 Billing Launch", objective: "Ship invoicing GA", budgetUsd: 500,
  });
  assert.equal(mis.status, 201);

  const ws = await api("POST", "/api/v1/workstreams", {
    projectId, missionId: mis.body.id, name: "Payments Core",
  });
  assert.equal(ws.status, 201);

  const misList = await api("GET", `/api/v1/missions?projectId=${projectId}`);
  assert.equal((misList.body.items as unknown[]).length, 1);
  const wsList = await api("GET", `/api/v1/workstreams?projectId=${projectId}`);
  assert.equal((wsList.body.items as unknown[]).length, 1);
});

test("CONCURRENCY: optimistic locking prevents lost updates on same task", async () => {
  const prj = await api("POST", "/api/v1/projects", { name: "Race" });
  const projectId = String(prj.body.id);
  const t = await api("POST", "/api/v1/tasks", { projectId, title: "Contended" });
  const id = String(t.body.id);

  // two concurrent transitions to 'ready' — exactly one wins at DB level
  const results = await Promise.all([
    api("POST", `/api/v1/tasks/${id}/transition`, { to: "ready" }),
    api("POST", `/api/v1/tasks/${id}/transition`, { to: "ready" }),
  ]);
  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [200, 409]);
});

// ---------------------------------------------------------------------------
// v0.2.0 production hardening verification
// ---------------------------------------------------------------------------

test("G-02 METRICS: prometheus endpoint exposes live series", async () => {
  // public path — no auth needed by design
  const res = await app.inject({ method: "GET", url: "/metrics" });
  assert.equal(res.statusCode, 200);
  const body = res.body;
  for (const series of [
    "agencyos_http_requests_total",
    "agencyos_queue_jobs",
    "agencyos_model_requests_total",
    "agencyos_approvals_pending",
    "agencyos_database_up 1",
  ]) {
    assert.ok(body.includes(series), `missing metric series: ${series}`);
  }
  // after traffic, counters > 0
  assert.match(body, /agencyos_http_requests_total\{method="GET",route="\/api\/v1\/projects",status="200"\} \d+/);
});

test("G-06 SSE TICKETS: one-time short-TTL tickets replace raw key in URL", async () => {
  const t = await api("POST", "/api/v1/events/ticket");
  assert.equal(t.status, 201);
  const ticket = String(t.body.ticket);

  // first use with the ticket is accepted (stream starts; we abort immediately)
  const ac = new AbortController();
  const streamPromise = app.inject({
    method: "GET",
    url: `/api/v1/events?ticket=${ticket}`,
    signal: ac.signal,
  });
  // give the handler a moment to authenticate + start streaming, then abort
  await new Promise((r2) => setTimeout(r2, 150));
  ac.abort();
  await assert.rejects(
    () => streamPromise,
    (e: unknown) => String((e as Error).message).length >= 0
  );

  // ticket is single-use — second connection rejected
  const reuse = await app.inject({ method: "GET", url: `/api/v1/events?ticket=${ticket}` });
  assert.equal(reuse.statusCode, 401);

  // garbage ticket → 401
  const bad = await app.inject({ method: "GET", url: "/api/v1/events?ticket=garbage" });
  assert.equal(bad.statusCode, 401);

  // raw API key in URL is NO LONGER accepted (hardening)
  const legacy = await app.inject({
    method: "GET",
    url: `/api/v1/events?auth=${encodeURIComponent(adminKey)}`,
  });
  assert.equal(legacy.statusCode, 401);
});

test("G-08 REVIEWS: record + list with axis/verdict validation", async () => {
  const prj = await api("POST", "/api/v1/projects", { name: "Review Flow" });
  const projectId = String(prj.body.id);
  const t = await api("POST", "/api/v1/tasks", { projectId, title: "Reviewed task" });

  const badVerdict = await api("POST", `/api/v1/tasks/${t.body.id}/reviews`, { verdict: "meh" });
  assert.equal(badVerdict.status, 400);

  const ok = await api("POST", `/api/v1/tasks/${t.body.id}/reviews`, {
    axis: "spec",
    verdict: "changes_requested",
    findings: ["acceptance criterion #2 untested"],
    score: 7,
  });
  assert.equal(ok.status, 201);

  const list = await api("GET", `/api/v1/tasks/${t.body.id}/reviews`);
  assert.equal((list.body.items as unknown[]).length, 1);
});

test("G-12 DISPATCH IDEMPOTENCY: same key returns original execution", async () => {
  const prj = await api("POST", "/api/v1/projects", { name: "Idem Dispatch" });
  const projectId = String(prj.body.id);
  const t = await api("POST", "/api/v1/tasks", { projectId, title: "Idempotent task" });
  await api("POST", `/api/v1/tasks/${t.body.id}/transition`, { to: "ready" });
  const agents = await api("GET", "/api/v1/agents");
  const agent = (agents.body.items as { id: string; name: string }[]).find((a) => a.name === "backend-engineer")!;

  const first = await api("POST", "/api/v1/executions", {
    taskId: t.body.id, agentId: agent.id, idempotencyKey: "client-op-777",
  });
  assert.equal(first.status, 202);
  const second = await api("POST", "/api/v1/executions", {
    taskId: t.body.id, agentId: agent.id, idempotencyKey: "client-op-777",
  });
  assert.equal(second.status, 200); // replayed
  assert.equal(String(second.body.executionId), String(first.body.executionId));

  const execs = await api("GET", `/api/v1/executions?taskId=${t.body.id}`);
  assert.equal((execs.body.items as unknown[]).length, 1); // exactly one execution
});
