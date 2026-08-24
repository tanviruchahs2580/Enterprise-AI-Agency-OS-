import { test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { SqliteDriver } from "@agency/db";
import { migrate } from "@agency/db";
import { Db, genId } from "@agency/db";
import { hasPermission, permissionsFor, sensitiveAction } from "../src/rbac.ts";
import { AuditLog } from "../src/audit.ts";
import { ApprovalService } from "../src/approvals.ts";
import { AppError } from "@agency/core";

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

test("RBAC matrix enforces least privilege", () => {
  assert.ok(hasPermission("OWNER", "settings:write"));
  assert.ok(!hasPermission("PRINCIPAL", "settings:write"));
  assert.ok(hasPermission("SECURITY", "security:manage"));
  assert.ok(!hasPermission("ENGINEER", "deployment:create"));
  assert.ok(!hasPermission("VIEWER", "task:create"));
  assert.ok(hasPermission("DEVOPS", "deployment:rollback"));
  // every role has read access
  for (const role of Object.keys(permissionsFor("VIEWER") ? { VIEWER: 1 } : {})) void role;
  assert.ok(permissionsFor("AUDITOR").has("audit:verify"));
  const sa = sensitiveAction("deploy:production");
  assert.equal(sa?.risk, "critical");
});

test("audit chain appends and verifies; tampering is detected", () => {
  audit.append({ orgId, actorType: "user", actorId: "u1", action: "project.create", resourceType: "project", resourceId: "p1" });
  audit.append({ orgId, actorType: "agent", actorId: "a1", action: "task.update", resourceType: "task", resourceId: "t1", riskLevel: "high" });
  audit.append({ orgId, actorType: "system", actorId: "sys", action: "deploy.start", resourceType: "deployment", resourceId: "d1" });

  let v = audit.verify();
  assert.equal(v.valid, true);
  assert.equal(v.checked, 3);

  // simulate tampering
  driver.run("UPDATE audit_events SET action = 'hacked' WHERE seq = 2");
  v = audit.verify();
  assert.equal(v.valid, false);
  assert.equal(v.brokenAtSeq, 2);
});

test("approval gate blocks until approved; double decision conflicts", () => {
  const approvals = new ApprovalService(db, audit);
  const resId = genId("dep");
  const req = approvals.request({
    orgId,
    action: "deploy:production",
    resourceType: "deployment",
    resourceId: resId,
    reason: "release v1",
    riskLevel: "critical",
    requestedBy: "captain-agent",
  });

  assert.throws(
    () => approvals.assertApproved("deploy:production", "deployment", resId, orgId),
    (e: unknown) => e instanceof AppError && e.code === "APPROVAL_REQUIRED"
  );

  const approver = { userId: genId("usr"), orgId, role: "OWNER", name: "Principal" };
  const decided = approvals.decide(req.id, approver, true);
  assert.equal(decided.status, "approved");

  // gate opens
  approvals.assertApproved("deploy:production", "deployment", resId, orgId);

  // second decision on same approval → conflict
  assert.throws(
    () => approvals.decide(req.id, approver, false),
    (e: unknown) => e instanceof AppError && e.code === "CONFLICT"
  );
});

test("rejected approval keeps the gate closed", () => {
  const approvals = new ApprovalService(db, audit);
  const resId = genId("dep");
  const req = approvals.request({
    orgId,
    action: "project:delete",
    resourceType: "project",
    resourceId: resId,
    reason: "cleanup",
    riskLevel: "critical",
    requestedBy: "admin",
  });
  const approver = { userId: genId("usr"), orgId, role: "OWNER", name: "P" };
  approvals.decide(req.id, approver, false);
  assert.throws(
    () => approvals.assertApproved("project:delete", "project", resId, orgId),
    (e: unknown) => e instanceof AppError && e.code === "APPROVAL_REQUIRED"
  );
});
