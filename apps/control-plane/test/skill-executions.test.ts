import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext, type AppContext } from "../src/context.ts";
import { buildApp } from "../src/app.ts";
import { AuthService } from "../src/auth.ts";
import type { FastifyInstance } from "fastify";

let ctx: AppContext;
let app: FastifyInstance;
const adminKey = "test-admin-key-0001";
let dataDir: string;

type Resp = { status: number; body: Record<string, unknown> };

async function api(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  key: string = adminKey
): Promise<Resp> {
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
  dataDir = mkdtempSync(join(tmpdir(), "agencyos-skx-"));
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
  app = buildApp(ctx);
});

after(async () => {
  await app.close();
  ctx.db.driver.close();
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* disposable temp dir */
  }
});

const record = async (body: Record<string, unknown>) =>
  api("POST", "/api/v1/skills/executions", body);

test("records verified executions and aggregates them per skill (T-J)", async () => {
  const r1 = await record({ skillName: "tdd-red-green-refactor", outcome: "success", durationMs: 1200, costUsd: 0.42 });
  const r2 = await record({ skillName: "tdd-red-green-refactor", outcome: "success", durationMs: 800, costUsd: 0.3 });
  const r3 = await record({ skillName: "tdd-red-green-refactor", outcome: "failed", costUsd: 0.1, error: "flaky test" });
  const r4 = await record({ skillName: "threat-model-stride", outcome: "skipped", durationMs: 0 });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r3.status, 200);
  assert.equal(r4.status, 200);

  const stats = await api("GET", "/api/v1/skills/executions/stats");
  assert.equal(stats.status, 200);
  const bySkill = stats.body.bySkill as Record<string, Record<string, number>>;
  const tdd = bySkill["tdd-red-green-refactor"]!;
  assert.equal(tdd.success, 2);
  assert.equal(tdd.failed, 1);
  // avg of success durations (1200 + 800) / 2
  assert.equal(tdd.avgDurationMs, 1000);
  const totals = stats.body.totals as { executions: number; success: number; failed: number; skipped: number };
  assert.equal(totals.executions, 4);
  assert.equal(totals.success, 2);
  assert.equal(totals.failed, 1);
  assert.equal(totals.skipped, 1);

  const list = await api("GET", "/api/v1/skills/executions", { limit: 10 } as Record<string, unknown>);
  assert.equal((list.body as { count: number }).count, 4);
});

test("rejects unknown skills, invalid outcomes, and missing fields", async () => {
  const badSkill = await record({ skillName: "does-not-exist", outcome: "success" });
  assert.equal(badSkill.status, 400);
  const badOutcome = await record({ skillName: "threat-model-stride", outcome: "partial" });
  assert.equal(badOutcome.status, 400);
  const missing = await record({ outcome: "success" });
  assert.equal(missing.status, 400);
});

test("execution records are org-scoped (arbitrary org isolation)", async () => {
  const org = await api("POST", "/api/v1/organizations", { name: "Solo Tenant" });
  const tenantKey = String(org.body.ownerKey ?? "");
  assert.ok(tenantKey);
  await record({ skillName: "diataxis-map", outcome: "success" });
  const tenantList = await api("GET", "/api/v1/skills/executions", undefined, tenantKey);
  assert.equal((tenantList.body as { count: number }).count, 0, "tenant sees no other org's executions");
  await api("POST", "/api/v1/skills/executions", { skillName: "diataxis-map", outcome: "failed" }, tenantKey);
  const stats = await api("GET", "/api/v1/skills/executions/stats", undefined, tenantKey);
  assert.equal((stats.body.totals as { executions: number }).executions, 1);
});