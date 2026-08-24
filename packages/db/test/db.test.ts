import { test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { SqliteDriver } from "../src/driver.ts";
import { migrate, migrationStatus } from "../src/migrate.ts";
import { Db, genId } from "../src/index.ts";

let driver: SqliteDriver;
let db: Db;

beforeEach(() => {
  driver = new SqliteDriver(":memory:");
  db = new Db(driver);
});

afterEach(() => {
  driver.close();
});

test("migrations apply cleanly and are idempotent", () => {
  const first = migrate(driver);
  assert.ok(first.length >= 1);
  const second = migrate(driver);
  assert.equal(second.length, 0);
  const status = migrationStatus(driver);
  assert.equal(status.pending, 0);
});

test("checksum drift is detected as tampering", () => {
  migrate(driver);
  driver.run(
    "UPDATE _migrations SET checksum = ? WHERE version = 1",
    ["deadbeef"]
  );
  assert.throws(() => migrate(driver), /checksum drift/);
});

test("schema supports full org→project→task flow with FK integrity", () => {
  migrate(driver);
  const now = new Date().toISOString();
  const org = genId("org");
  const user = genId("usr");
  const project = genId("prj");
  const agent = genId("agt");
  const taskA = genId("tsk");
  const taskB = genId("tsk");

  db.transaction(() => {
    db.insert("organizations", { id: org, name: "Acme", slug: "acme", created_at: now, updated_at: now });
    db.insert("users", { id: user, org_id: org, email: "owner@acme.io", name: "Owner", role: "OWNER", created_at: now, updated_at: now });
    db.insert("projects", { id: project, org_id: org, name: "Billing", slug: "billing", status: "active", created_by: user, created_at: now, updated_at: now });
    db.insert("agents", { id: agent, org_id: org, name: "backend-dev", role: "BACKEND_ENGINEER", created_at: now, updated_at: now });
    for (const t of [taskA, taskB]) {
      db.insert("tasks", { id: t, org_id: org, project_id: project, title: "task", created_by: user, created_at: now, updated_at: now });
    }
    db.insert("task_dependencies", { id: genId("dep"), task_id: taskB, depends_on_task_id: taskA, created_at: now });
  });

  const dep = db.get<{ task_id: string }>("SELECT task_id FROM task_dependencies WHERE depends_on_task_id = ?", [taskA]);
  assert.equal(dep?.task_id, taskB);

  // optimistic locking: stale version update fails
  const ok1 = db.updateById("tasks", taskA, { title: "v2" }, { expectedVersion: 1, bumpVersion: true });
  assert.ok(ok1);
  const ok2 = db.updateById("tasks", taskA, { title: "v3-stale" }, { expectedVersion: 1, bumpVersion: true });
  assert.equal(ok2, false);

  // FK enforcement blocks orphan insert
  assert.throws(() =>
    db.insert("tasks", {
      id: genId("tsk"),
      org_id: org,
      project_id: genId("prj"),
      title: "orphan",
      created_by: user,
      created_at: now,
      updated_at: now,
    })
  );
});
