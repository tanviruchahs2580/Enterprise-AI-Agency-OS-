import { newId, AppError } from "@agency/core";
import type { Db } from "@agency/db";
import type { AuditLog, AuditInput } from "./audit.ts";

export interface ApprovalRequestInput {
  orgId: string;
  projectId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  riskLevel: "medium" | "high" | "critical";
  requestedBy: string;
  ttlMinutes?: number;
}

export interface Identity {
  userId: string;
  orgId: string;
  role: string; // Role
  name: string;
}

/**
 * Human-in-the-loop approval gates. High-risk autonomous actions create an
 * approval row; the action may only proceed once a permitted human decides.
 * Expired requests auto-fail (checked on read).
 */
export class ApprovalService {
  private db: Db;
  private audit: AuditLog;
  constructor(db: Db, audit: AuditLog) {
    this.db = db;
    this.audit = audit;
  }

  request(input: ApprovalRequestInput): { id: string; status: string; expiresAt: string } {
    const id = newId("apr");
    const now = this.db.now();
    const ttl = input.ttlMinutes ?? 60;
    const expiresAt = new Date(Date.parse(now) + ttl * 60_000).toISOString();
    this.db.insert("approvals", {
      id,
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      reason: input.reason,
      risk_level: input.riskLevel,
      requested_by: input.requestedBy,
      decision: "pending",
      expires_at: expiresAt,
      created_at: now,
    });
    this.audit.append({
      orgId: input.orgId,
      actorType: "agent",
      actorId: input.requestedBy,
      action: "approval.requested",
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      riskLevel: input.riskLevel,
      metadata: { approvalId: id, requestedAction: input.action },
    });
    return { id, status: "pending", expiresAt };
  }

  decide(approvalId: string, approver: Identity, approve: boolean): Record<string, unknown> {
    const row = this.db.get<{
      id: string;
      org_id: string;
      decision: string;
      expires_at: string;
      action: string;
      resource_type: string;
      resource_id: string;
    }>("SELECT * FROM approvals WHERE id = ?", [approvalId]);
    if (!row) throw new AppError("NOT_FOUND", `approval ${approvalId} not found`);
    if (row.org_id !== approver.orgId) throw new AppError("FORBIDDEN", "cross-org access denied");
    if (row.decision !== "pending") {
      throw new AppError("CONFLICT", `approval already decided: ${row.decision}`);
    }
    const now = this.db.now();
    if (Date.parse(row.expires_at) < Date.parse(now)) {
      this.db.updateById("approvals", approvalId, { decision: "expired", decided_at: now });
      throw new AppError("CONFLICT", "approval request expired");
    }

    this.db.updateById("approvals", approvalId, {
      decision: approve ? "approved" : "rejected",
      approver_id: approver.userId,
      decided_at: now,
    });
    const audit: AuditInput = {
      orgId: row.org_id,
      actorType: "user",
      actorId: approver.userId,
      action: approve ? "approval.approved" : "approval.rejected",
      resourceType: "approval",
      resourceId: approvalId,
      riskLevel: "high",
      metadata: { requestedAction: row.action },
    };
    this.audit.append(audit);

    return { id: approvalId, status: approve ? "approved" : "rejected" };
  }

  /** Assert there is a live approved decision for the given action+resource. */
  assertApproved(action: string, resourceType: string, resourceId: string, orgId: string): void {
    const row = this.db.get<{ id: string; expires_at: string }>(
      `SELECT id, expires_at FROM approvals
       WHERE org_id = ? AND action = ? AND resource_type = ? AND resource_id = ?
         AND decision = 'approved'
       ORDER BY created_at DESC LIMIT 1`,
      [orgId, action, resourceType, resourceId]
    );
    if (!row) {
      throw new AppError("APPROVAL_REQUIRED", `action '${action}' requires human approval`, {
        details: { action, resourceType, resourceId },
      });
    }
  }

  listPending(orgId: string): Row[] {
    return this.db.all(
      "SELECT * FROM approvals WHERE org_id = ? AND decision = 'pending' ORDER BY created_at",
      [orgId]
    );
  }
}

type Row = Record<string, unknown>;
