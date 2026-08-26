import type { Db } from "@agency/db";
import type { AuditLog } from "@agency/security";

/**
 * Approval sweeper (GAP G-03): deterministically expires pending approvals
 * past their TTL. Idempotent and safe under concurrent workers — the UPDATE
 * only touches rows still in 'pending' (conditional), and each expiry writes
 * one hash-chained audit event via AuditLog.append.
 */
export function sweepExpiredApprovals(db: Db, audit: AuditLog): number {
  const now = db.now();
  const expired = db.all<{ id: string; org_id: string; action: string }>(
    "SELECT id, org_id, action FROM approvals WHERE decision = 'pending' AND expires_at < ?",
    [now]
  );
  let n = 0;
  for (const row of expired) {
    const changed = db.driver.run(
      "UPDATE approvals SET decision = 'expired', decided_at = ? WHERE id = ? AND decision = 'pending'",
      [now, String(row.id)]
    );
    if (Number(changed.changes) === 1) {
      n++;
      audit.append({
        orgId: String(row.org_id),
        actorType: "system",
        actorId: "approval-sweeper",
        action: "approval.expired",
        resourceType: "approval",
        resourceId: String(row.id),
        riskLevel: "medium",
        decision: "reject",
        result: "success",
        metadata: { requestedAction: row.action, reason: "ttl elapsed" },
      });
    }
  }

  // Phase A/F-01: approved-but-never-consumed rows past expiry also flip to
  // 'expired' so stale grants cannot linger as usable-looking state.
  const staleApproved = db.all<{ id: string; org_id: string; action: string }>(
    "SELECT id, org_id, action FROM approvals WHERE decision = 'approved' AND consumed_at IS NULL AND expires_at < ?",
    [now]
  );
  for (const row of staleApproved) {
    const changed = db.driver.run(
      "UPDATE approvals SET decision = 'expired', consumed_at = ? WHERE id = ? AND decision = 'approved' AND consumed_at IS NULL",
      [now, String(row.id)]
    );
    if (Number(changed.changes) === 1) {
      n++;
      audit.append({
        orgId: String(row.org_id),
        actorType: "system",
        actorId: "approval-sweeper",
        action: "approval.expired",
        resourceType: "approval",
        resourceId: String(row.id),
        riskLevel: "medium",
        decision: "reject",
        result: "success",
        metadata: { requestedAction: row.action, reason: "approved but never consumed past ttl" },
      });
    }
  }
  return n;
}
