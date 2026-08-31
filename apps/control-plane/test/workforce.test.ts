import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
let originalCwd: string;

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

const SEED_SKILL_YAML = `name: tdd-red-green-refactor
version: 9.0.0-e2e
description: workforce e2e skill
procedure: [run the red phase, run the green phase]
verification: trivially satisfied
failureHandling: retry(maxAttempts=2, delayMs=0)
inputs: {}
outputs: {}
preconditions: []
requiredTools: [test-runner]
requiredPermissions: []
`;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "agencyos-workforce-"));
  // SkillRegistry loads from `<cwd>/workflows/skills`; chdir into the temp
  // sandbox so this test passes regardless of the caller's working directory.
  const skillsDir = join(dataDir, "workflows", "skills");
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(join(skillsDir, "tdd-e2e.yaml"), SEED_SKILL_YAML, "utf8");
  originalCwd = process.cwd();
  process.chdir(dataDir);
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
  process.chdir(originalCwd);
});

test("GET /api/v1/meta advertises 0.12.0 with the workforce features", async () => {
  const r = await api("GET", "/api/v1/meta");
  assert.equal(r.status, 200);
  const body = r.body as {
    version: string;
    features: Record<string, boolean>;
    capabilities: Record<string, unknown>;
  };
  assert.equal(body.version, "0.12.0");
  assert.equal(body.features.missionCompiler, true);
  assert.equal(body.features.capabilityRouting, true);
  assert.equal(body.features.workGraph, true);
  assert.equal(body.features.handoffContract, true);
  assert.equal(body.features.evidenceRegistry, true);
  assert.equal(body.capabilities.skillRuntime, true);
});

test("POST /api/v1/missions/compile is deterministic and rejects empty objectives", async () => {
  const r = await api("POST", "/api/v1/missions/compile", {
    objective: "Ship a reversible database migration with acceptance criteria.",
    constraints: ["test-first"],
  });
  assert.equal(r.status, 200);
  const plan = r.body.plan as { complexity: string; risk: string; requiredCapabilities: string[]; derivedName: string };
  assert.ok(["simple", "medium", "complex", "enterprise"].includes(plan.complexity));
  assert.ok(["low", "medium", "high"].includes(plan.risk));
  assert.ok(Array.isArray(plan.requiredCapabilities));

  const again = await api("POST", "/api/v1/missions/compile", {
    objective: "Ship a reversible database migration with acceptance criteria.",
    constraints: ["test-first"],
  });
  assert.deepEqual(again.body, r.body, "same objective ⇒ same plan");

  const bad = await api("POST", "/api/v1/missions/compile", {});
  assert.equal(bad.status, 400);
});

test("POST /api/v1/routing/decide persists an auditable decision", async () => {
  const r = await api("POST", "/api/v1/routing/decide", {
    missionId: "mission_test_1",
    requiredCapabilities: ["acceptance-criteria"],
    risk: "high",
  });
  assert.equal(r.status, 201);
  const decision = r.body.decision as {
    primaryAgentId: string;
    candidates: unknown[];
    whyAgentSelected: string;
    policyVersion: number;
  };
  assert.ok(decision.primaryAgentId);
  assert.ok(decision.candidates.length >= 1);
  assert.ok(decision.whyAgentSelected);
  assert.equal(decision.policyVersion, 1);
  assert.match(String(r.body.id), /^rtd_/);

  const audit = ctx.db.get("SELECT * FROM routing_decisions WHERE id = ?", [String(r.body.id)]);
  assert.ok(audit);
  assert.equal(String(audit.primary_agent_id), decision.primaryAgentId);

  const list = await api("GET", "/api/v1/routing/decisions");
  assert.equal(list.status, 200);
  const items = list.body.items as unknown[];
  assert.ok(items.length >= 1);
});

test("POST /api/v1/routing/decide rejects unknown capabilities", async () => {
  const r = await api("POST", "/api/v1/routing/decide", {
    requiredCapabilities: ["not-a-capability"],
  });
  assert.equal(r.status, 400);
  assert.match(String((r.body as { error: { message: string } }).error.message), /unknown capability/);
});

test("GET /api/v1/agents/reachability reports the roster as reachable", async () => {
  const r = await api("GET", "/api/v1/agents/reachability");
  assert.equal(r.status, 200);
  const body = r.body as {
    total: number;
    reachableCount: number;
    unreachable: string[];
  };
  assert.ok(body.total > 10);
  assert.equal(body.reachableCount, body.total);
  assert.deepEqual(body.unreachable, []);
});

test("evidence registry: add, list, verify, tamper detection + isolation", async () => {
  const org = await api("POST", "/api/v1/organizations", { name: "Workforce Tenant" });
  assert.equal(org.status, 201);
  const tenantKey = (org.body.ownerKey as string) ?? "";

  const add = await api("POST", "/api/v1/evidence", {
    type: "tests.passed",
    source: "jest:run",
    content: "123 passed, 0 failed",
    claims: ["tests.passed"],
  });
  assert.equal(add.status, 201);
  const id = String(add.body.id);
  assert.ok(add.body.contentHash);

  const add2 = await api("POST", "/api/v1/evidence", {
    type: "tests.passed",
    source: "jest:run",
    contentHash: String(add.body.contentHash),
  });
  assert.equal(add2.status, 201, "hash-only records are accepted");

  const mismatch = await api("POST", "/api/v1/evidence", {
    type: "tests.passed",
    source: "jest:run",
    content: "x",
    contentHash: "deadbeef",
  });
  assert.equal(mismatch.status, 400);

  const list = await api("GET", "/api/v1/evidence");
  assert.equal(list.status, 200);
  assert.equal((list.body as { count: number }).count, 2);

  const verify = await api("POST", `/api/v1/evidence/${id}/verify`, { content: "123 passed, 0 failed" });
  assert.equal(verify.status, 200);
  assert.equal((verify.body as { intact: boolean }).intact, true);

  const tampered = await api("POST", `/api/v1/evidence/${id}/verify`, { content: "0 passed" });
  assert.equal((tampered.body as { intact: boolean }).intact, false);

  const tenantView = await api("GET", "/api/v1/evidence", undefined, tenantKey);
  assert.equal((tenantView.body as { count: number }).count, 0, "evidence is org-isolated");
});

test("handoffs enforce the confidence contract and persist what/remains", async () => {
  const r = await api("POST", "/api/v1/handoffs", {
    sender: "backend-engineer",
    receiver: "qa-engineer",
    intent: "implementation",
    payload: { task: "add /api/v1/ping", branch: "feature/ping" },
    confidence: 0.92,
    assumptions: ["mock server is up"],
    evidence: ["evd_0001"],
  });
  assert.equal(r.status, 201);
  const id = String(r.body.id);
  assert.ok(id.startsWith("hnd_"));
  const policy = r.body.suggestedPolicy as string;
  assert.equal(policy, "standard", "confidence ≥ 0.9 ⇒ standard verification policy");

  const bad = await api("POST", "/api/v1/handoffs", {
    sender: "backend-engineer",
    receiver: "qa-engineer",
    intent: "bogus-intent",
    payload: {},
    confidence: 2.5,
  });
  assert.equal(bad.status, 400);

  const bySender = await api("GET", "/api/v1/handoffs?receiver=qa-engineer");
  assert.equal(bySender.status, 200);
  const items = bySender.body.items as Array<{ id: string; confidence: number; assumptions: string[] }>;
  assert.ok(items.some((h) => h.id === id));
  const hit = items.find((h) => h.id === id)!;
  assert.equal(hit.confidence, 0.92);
  assert.deepEqual(hit.assumptions, ["mock server is up"]);

  const none = await api("GET", "/api/v1/handoffs?receiver=nobody");
  assert.equal((none.body as { items: unknown[] }).items.length, 0);
});

test("skill runtime: rubric failure, evidence-required gate, then success", async () => {
  const ok = await api("POST", "/api/v1/skills/runtime/execute", {
    skillName: "tdd-red-green-refactor",
    input: { loop: "red-green" },
    claims: [],
  });
  assert.equal(ok.status, 200);
  assert.equal((ok.body as { ok: boolean }).ok, true);
  assert.match(String(ok.body.id), /^skx_/);

  // a claim without matching evidence must fail verification on the guard
  const missingEvidence = await api("POST", "/api/v1/skills/runtime/execute", {
    skillName: "tdd-red-green-refactor",
    claims: ["tests passed"],
  });
  assert.equal(missingEvidence.status, 422);
  assert.match(String((missingEvidence.body as { result: { failureMessage: string } }).result.failureMessage), /evidence_required/);

  // record the evidence, then the same claim passes
  await api("POST", "/api/v1/evidence", { type: "test-result", source: "ci", content: "green" });
  const nowProven = await api("POST", "/api/v1/skills/runtime/execute", {
    skillName: "tdd-red-green-refactor",
    claims: ["tests passed"],
  });
  assert.equal(nowProven.status, 200);
  assert.equal((nowProven.body as { ok: boolean }).ok, true);
});