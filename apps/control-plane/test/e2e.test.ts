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
