import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteDriver, migrate, Db, genId } from "@agency/db";
import { JobQueue } from "../src/jobs.ts";

test("G-10 RESTART RECOVERY: queued jobs survive full close→reopen cycle", async () => {
  const dir = mkdtempSync(join(tmpdir(), "restart-"));
  const file = join(dir, "state.sqlite");

  // session 1: schema + org + one pending job, then hard close (simulated crash)
  let driver = new SqliteDriver(file);
  migrate(driver);
  const db1 = new Db(driver);
  const orgId = genId("org");
  const now = db1.now();
  db1.insert("organizations", { id: orgId, name: "R", slug: "r", created_at: now, updated_at: now });
  const q1 = new JobQueue(db1);
  q1.enqueue({ orgId, type: "survivor", data: {} });
  driver.close();

  // session 2: reopen same file, register handler, drain queue
  driver = new SqliteDriver(file);
  migrate(driver); // must be no-op
  const db2 = new Db(driver);
  const q2 = new JobQueue(db2);
  let ran = 0;
  q2.register("survivor", async () => {
    ran++;
  });
  assert.ok(await q2.processOne());
  assert.equal(ran, 1);
  driver.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});
