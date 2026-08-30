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
let offApp: FastifyInstance;
const adminKey = "test-admin-key-0001";
let dataDir: string;

type Resp = { status: number; body: Record<string, unknown> };

const makeApi = (app: FastifyInstance, key: string = adminKey) =>
  async function api(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>
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
  };

let api: ReturnType<typeof makeApi>;
let apiOff: ReturnType<typeof makeApi>;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "agencyos-a2a-"));
  const base = {
    NODE_ENV: "test" as const,
    DATABASE_URL: join(dataDir, "on.sqlite"),
    ADMIN_BOOTSTRAP_KEY: adminKey,
    PORT: "0",
    LOG_LEVEL: "error",
    SANDBOX_PROVIDER: "process",
  };
  ctx = buildContext({ ...base, FEATURE_A2A: "true" });
  const auth = new AuthService(ctx.db);
  auth.ensureBootstrapKey(ctx.defaultOrgId(), adminKey);
  ctx.agents.seedRoster(ctx.defaultOrgId());
  app = buildApp(ctx);

  const offCtx = buildContext({ ...base, DATABASE_URL: join(dataDir, "off.sqlite") });
  const offAuth = new AuthService(offCtx.db);
  offAuth.ensureBootstrapKey(offCtx.defaultOrgId(), adminKey);
  offApp = buildApp(offCtx);

  api = makeApi(app);
  apiOff = makeApi(offApp);
});

after(async () => {
  await app.close();
  ctx.db.driver.close();
  await offApp.close();
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* disposable temp dir */
  }
});

test("A2A endpoints are gated behind FEATURE_A2A (404 when disabled)", async () => {
  const r = await apiOff("GET", "/api/v1/a2a/cards");
  assert.equal(r.status, 404);
});

test("registers outbound cards and transitions their status (T-K)", async () => {
  const created = await api("POST", "/api/v1/a2a/cards", {
    direction: "outbound",
    partner: "agency-ops",
    payload: { kind: "request-analysis", ref: "tx-1" },
  });
  assert.equal(created.status, 201);
  const id = String(created.body.id ?? "");
  assert.ok(id.startsWith("a2a_"));

  const accepted = await api("POST", `/api/v1/a2a/cards/${id}/status`, { status: "accepted" });
  assert.equal(accepted.status, 200);
  // an ack token is minted on acceptance for the partner to validate leg timers
  assert.ok(String(accepted.body.ackToken ?? "").length > 0);

  await api("POST", `/api/v1/a2a/cards/${id}/status`, { status: "working" });
  const done = await api("POST", `/api/v1/a2a/cards/${id}/status`, { status: "completed" });
  assert.equal((done.body as { status: string }).status, "completed");

  const one = await api("GET", `/api/v1/a2a/cards/${id}`);
  assert.equal(one.status, 200);
  const payload = (one.body as { payload: Record<string, unknown> }).payload;
  assert.equal(payload.kind, "request-analysis");
});

test("card list filters by direction and status within the org", async () => {
  await api("POST", "/api/v1/a2a/cards", {
    direction: "inbound",
    payload: { kind: "approval-request" },
  });
  const all = await api("GET", "/api/v1/a2a/cards");
  assert.ok(Number((all.body as { count: number }).count) >= 2);
  const inbound = await api("GET", "/api/v1/a2a/cards?direction=inbound&status=received");
  assert.equal(Number((inbound.body as { count: number }).count), 1);
});

test("rejects invalid directions, statuses, and unknown cards", async () => {
  const badDir = await api("POST", "/api/v1/a2a/cards", { direction: "lateral", payload: {} });
  assert.equal(badDir.status, 400);
  const badStatus = await api("POST", "/api/v1/a2a/cards", {
    direction: "outbound",
    payload: {},
    status: "moon-phase",
  });
  assert.equal(badStatus.status, 400);
  const unknown = await api("POST", "/api/v1/a2a/cards/a2a_nope/status", { status: "completed" });
  assert.equal(unknown.status, 404);
});

test("a2a cards are org-scoped (tenant cannot see them)", async () => {
  const org = await api("POST", "/api/v1/organizations", { name: "Card Tenant" });
  const tenantKey = String(org.body.ownerKey ?? "");
  assert.ok(tenantKey);
  const tenantApi = makeApi(app, tenantKey);
  const list = await tenantApi("GET", "/api/v1/a2a/cards");
  assert.equal((list.body as { count: number }).count, 0);
});