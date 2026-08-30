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
  dataDir = mkdtempSync(join(tmpdir(), "agencyos-skills-"));
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

const BASE_DESC = "Test-first implementation loop";
const OVERRIDE_YAML = `
name: tdd-red-green-refactor
version: 2.0.0-org
description: org-customized TDD skill
procedure:
  - write failing test
  - confirm it fails for the right reason
  - implement minimal change
  - confirm green
verification: all tests pass and the failing case is covered
failureHandling: revert to first red
inputs: {}
outputs: {}
preconditions:
  - test harness exists
requiredTools:
  - test-runner
requiredPermissions:
  - execution:test
`;

test("GET /api/v1/skills returns the declarative registry with no overrides", async () => {
  const r = await api("GET", "/api/v1/skills");
  assert.equal(r.status, 200);
  const items = r.body.items as Array<{ name: string; overridden: boolean }>;
  const tdd = items.find((s) => s.name === "tdd-red-green-refactor");
  assert.ok(tdd);
  assert.equal(tdd.overridden, false);
  assert.deepEqual(r.body.orgOverrides, []);
});

test("PUT override customizes the skill for the owning org only (T-I isolation)", async () => {
  // provision a second tenant to prove org scoping at the API layer
  const org = await api("POST", "/api/v1/organizations", { name: "Tenant B" });
  assert.equal(org.status, 201);
  const tenantKey = (org.body.ownerKey as string) ?? "";
  assert.ok(tenantKey.length > 0);

  // org A (default): put an override on the TDD skill
  const put = await api("PUT", "/api/v1/skills/overrides/tdd-red-green-refactor", {
    definition: OVERRIDE_YAML,
  });
  assert.equal(put.status, 200);
  assert.equal((put.body as { enabled: boolean }).enabled, true);

  // org A now sees the customized skill
  const mine = await api("GET", "/api/v1/skills/tdd-red-green-refactor");
  assert.equal(mine.status, 200);
  assert.equal((mine.body as { description: string }).description, "org-customized TDD skill");
  assert.equal((mine.body as { overridden: boolean }).overridden, true);

  // tenant B is untouched
  const theirs = await api("GET", "/api/v1/skills/tdd-red-green-refactor", undefined, tenantKey);
  assert.equal(theirs.status, 200);
  const bDesc = (theirs.body as { description: string }).description;
  assert.ok(bDesc.includes(BASE_DESC), bDesc);
  assert.notEqual(bDesc, "org-customized TDD skill");
  assert.equal((theirs.body as { overridden: boolean }).overridden, false);

  // listing for org A reports the override; tenant B lists none
  const listA = await api("GET", "/api/v1/skills");
  assert.equal((listA.body as { orgOverrides: unknown[] }).orgOverrides.length, 1);
  const listB = await api("GET", "/api/v1/skills", undefined, tenantKey);
  assert.equal((listB.body as { orgOverrides: unknown[] }).orgOverrides.length, 0);
});

test("invalid override definition is rejected without mutation", async () => {
  const bad = await api("PUT", "/api/v1/skills/overrides/tdd-red-green-refactor", {
    definition: "name: tdd-red-green-refactor\nversion: 9\n",
  });
  assert.equal(bad.status, 400);
  const stored = ctx.db.get(
    "SELECT definition, enabled FROM org_skill_overrides WHERE org_id = ? AND skill_name = ?",
    [ctx.defaultOrgId(), "tdd-red-green-refactor"]
  );
  // previous valid override is untouched
  assert.equal(stored?.enabled, 1);
  assert.equal(String(stored?.definition).includes("org-customized TDD skill"), true);
});

test("disabled override falls back to the registry base (enabled=false)", async () => {
  const off = await api("PUT", "/api/v1/skills/overrides/tdd-red-green-refactor", {
    definition: OVERRIDE_YAML.replace("org-customized", "disabled-customized"),
    enabled: false,
  });
  assert.equal(off.status, 200);
  const mine = await api("GET", "/api/v1/skills/tdd-red-green-refactor");
  assert.equal((mine.body as { overridden: boolean }).overridden, false);
});

test("DELETE override restores the registry default", async () => {
  await api("PUT", "/api/v1/skills/overrides/tdd-red-green-refactor", {
    definition: OVERRIDE_YAML,
  });
  const del = await api("DELETE", "/api/v1/skills/overrides/tdd-red-green-refactor");
  assert.equal(del.status, 200);
  assert.equal((del.body as { removed: boolean }).removed, true);
  const mine = await api("GET", "/api/v1/skills/tdd-red-green-refactor");
  assert.equal((mine.body as { overridden: boolean }).overridden, false);
  const list = await api("GET", "/api/v1/skills");
  assert.equal((list.body as { orgOverrides: unknown[] }).orgOverrides.length, 0);
});