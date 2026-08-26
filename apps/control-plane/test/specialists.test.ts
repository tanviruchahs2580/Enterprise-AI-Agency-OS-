import { test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { SqliteDriver, migrate, Db, genId } from "@agency/db";
import type { AppContext } from "../src/context.ts";
import {
  pmDecompose,
  reqReadinessCheck,
  architectAdrDraft,
  srePostDeployCheck,
} from "../src/specialists.ts";

let driver: SqliteDriver;
let ctx: AppContext;
let orgId = "";

beforeEach(() => {
  driver = new SqliteDriver(":memory:");
  const db = new Db(driver);
  migrate(db.driver);
  ctx = { db } as unknown as AppContext;
  const now = db.now();
  orgId = genId("org");
  db.insert("organizations", { id: orgId, name: "T", slug: "t", created_at: now, updated_at: now });
});

afterEach(() => {
  driver.close();
});

test("B4 pm_decompose writes structured stories knowledge doc", () => {
  const r = pmDecompose(ctx, {
    orgId, projectId: undefined, taskId: "tsk_pm",
    title: "Build checkout. Support coupons. Send receipts.",
    description: "",
  });
  const row = ctx.db.get<{ title: string; content: string; created_by: string }>(
    "SELECT title, content, created_by FROM knowledge_documents WHERE id=?", [r.id]
  );
  assert.match(row!.title, /Stories tsk_pm/);
  const parsed = JSON.parse(row!.content) as { stories: unknown[] };
  assert.ok(parsed.stories.length >= 1 && parsed.stories.length <= 3);
  assert.equal(row!.created_by, "product-manager");
});

test("B4 req_readiness_check flags short title and empty description", () => {
  assert.deepEqual(
    reqReadinessCheck({ title: "abc", description: "" }),
    ["title shorter than 8 chars", "empty description"]
  );
  assert.deepEqual(reqReadinessCheck({ title: "A perfectly clear task title", description: "details" }), []);
});

test("B4 architect_adr_draft persists decision doc for modify-mode", () => {
  const r = architectAdrDraft(ctx, {
    orgId, projectId: undefined, taskId: "tsk_adr", moduleName: "pricing",
  });
  const row = ctx.db.get<{ kind: string; content: string }>(
    "SELECT kind, content FROM knowledge_documents WHERE id=?", [r.id]
  );
  assert.equal(row?.kind, "decision");
  assert.match(row!.content, /Modify-mode delivery/);
});

test("B4 sre_postdeploy_check persists SLO operational stub", () => {
  const r = srePostDeployCheck(ctx, {
    orgId, deploymentId: "dep_x", projectId: undefined,
  });
  const row = ctx.db.get<{ kind: string; content: string }>(
    "SELECT kind, content FROM knowledge_documents WHERE id=?", [r.id]
  );
  assert.equal(row?.kind, "operational");
  assert.match(row!.content, /99\.9%/);
});
