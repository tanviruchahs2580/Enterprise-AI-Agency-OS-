import { test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { SqliteDriver, migrate, Db, genId } from "@agency/db";
import { AuditLog } from "@agency/security";
import { sweepExpiredApprovals } from "../src/sweeper.ts";

let driver: SqliteDriver;
let db: Db;
let audit: AuditLog;
let orgId = "";

beforeEach(() => {
  driver = new SqliteDriver(":memory:");
  db = new Db(driver);
  migrate(driver);
  audit = new AuditLog(db);
  const now = db.now();
  orgId = genId("org");
  db.insert("organizations", { id: orgId, name: "T", slug: "t", created_at: now, updated_at: now });
});

afterEach(() => {
  driver.close();
});

test("sweeper expires only past-TTL pending approvals and audits each", () => {
  const now = db.now();
  const expiredId = genId("apr");
  const liveId = genId("apr");
  db.insert("approvals", {
    id: expiredId, org_id: orgId, action: "deploy:staging",
    resource_type: "deployment", resource_id: "r1", reason: "old",
    risk_level: "medium", requested_by: "a", decision: "pending",
    expires_at: new Date(Date.parse(now) - 60_000).toISOString(),
    created_at: now,
  });
  db.insert("approvals", {
    id: liveId, org_id: orgId, action: "deploy:staging",
    resource_type: "deployment", resource_id: "r2", reason: "fresh",
    risk_level: "medium", requested_by: "a", decision: "pending",
    expires_at: new Date(Date.parse(now) + 3_600_000).toISOString(),
    created_at: now,
  });

  const n = sweepExpiredApprovals(db, audit);
  assert.equal(n, 1);

  const expiredRow = db.get<{ decision: string }>("SELECT decision FROM approvals WHERE id=?", [expiredId]);
  const liveRow = db.get<{ decision: string }>("SELECT decision FROM approvals WHERE id=?", [liveId]);
  assert.equal(String(expiredRow!.decision), "expired");
  assert.equal(String(liveRow!.decision), "pending");

  // idempotent: second pass finds nothing
  assert.equal(sweepExpiredApprovals(db, audit), 0);

  // audit event written with chain intact
  const v = audit.verify(orgId);
  assert.equal(v.valid, true);
  const actions = audit.list(orgId, 10).map((r) => String(r.action));
  assert.ok(actions.includes("approval.expired"));
});

test("A1: sweeper expires approved-but-unconsumed past-TTL approvals", () => {
  const now = db.now();
  const staleApproved = genId("apr");
  db.insert("approvals", {
    id: staleApproved, org_id: orgId, action: "deploy:production",
    resource_type: "deployment", resource_id: "rX", reason: "granted then forgotten",
    risk_level: "critical", requested_by: "cap", decision: "approved",
    approver_id: "u1", decided_at: now,
    expires_at: new Date(Date.parse(now) - 30_000).toISOString(),
    created_at: now,
  });

  const n = sweepExpiredApprovals(db, audit);
  assert.equal(n, 1);
  const row = db.get<{ decision: string; consumed_at: string | null }>(
    "SELECT decision, consumed_at FROM approvals WHERE id=?", [staleApproved]
  );
  assert.equal(row?.decision, "expired");
  assert.ok(row?.consumed_at, "consumption stamped on sweep");

  // gate now reports plain APPROVAL_REQUIRED (none) rather than usable grant
});
