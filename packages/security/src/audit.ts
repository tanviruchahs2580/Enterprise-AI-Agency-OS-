import { newId, sha256Hex, canonicalJson, AppError } from "@agency/core";
import type { Db } from "@agency/db";
import type { ActorType } from "@agency/core";

export interface AuditInput {
  orgId: string | null;
  actorType: ActorType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  decision?: "allow" | "deny" | "approve" | "reject";
  result?: "success" | "failure";
  metadata?: Record<string, unknown>;
}

export interface AuditRecord {
  seq: number;
  id: string;
  hash: string;
}

/**
 * Append-only, hash-chained audit log.
 * hash = sha256(prev_hash || canonical(event)) — tamper-evident (ADR-0010).
 */
export class AuditLog {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  append(input: AuditInput): AuditRecord {
    return this.db.transaction(() => {
      const last = this.db.get<{ hash: string }>(
        "SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1"
      );
      const prevHash = last?.hash ?? "GENESIS";
      const createdAt = this.db.now();
      const id = newId("aud");
      const body = {
        id,
        org_id: input.orgId,
        actor_type: input.actorType,
        actor_id: input.actorId,
        action: input.action,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        request_id: input.requestId ?? null,
        risk_level: input.riskLevel ?? "low",
        decision: input.decision ?? "allow",
        result: input.result ?? "success",
        metadata: input.metadata ?? {},
        created_at: createdAt,
      };
      const hash = sha256Hex(prevHash + canonicalJson(body));
      const res = this.db.driver.run(
        `INSERT INTO audit_events
          (id, org_id, actor_type, actor_id, action, resource_type, resource_id, request_id,
           risk_level, decision, result, metadata, prev_hash, hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, body.org_id, body.actor_type, body.actor_id, body.action,
          body.resource_type, body.resource_id, body.request_id,
          body.risk_level, body.decision, body.result,
          JSON.stringify(body.metadata), prevHash, hash, createdAt,
        ]
      );
      // SQLite AUTOINCREMENT seq — recover from rowid of insert.
      const seqRow = this.db.get<{ seq: number }>(
        "SELECT seq FROM audit_events WHERE id = ?",
        [id]
      );
      void res;
      return { seq: Number(seqRow!.seq), id, hash };
    });
  }

  /** Recompute the full chain; returns first broken index if any. */
  verify(orgId?: string): { valid: boolean; checked: number; brokenAtSeq?: number } {
    const rows = orgId
      ? this.db.all("SELECT * FROM audit_events WHERE org_id = ? ORDER BY seq", [orgId])
      : this.db.all("SELECT * FROM audit_events ORDER BY seq");

    let prevHash = "GENESIS";
    for (const r of rows) {
      if (r.prev_hash !== prevHash) {
        return { valid: false, checked: rows.length, brokenAtSeq: Number(r.seq) };
      }
      const body = {
        id: r.id,
        org_id: r.org_id,
        actor_type: r.actor_type,
        actor_id: r.actor_id,
        action: r.action,
        resource_type: r.resource_type,
        resource_id: r.resource_id,
        request_id: r.request_id,
        risk_level: r.risk_level,
        decision: r.decision,
        result: r.result,
        metadata: safeParse(String(r.metadata)),
        created_at: r.created_at,
      };
      const expected = sha256Hex(prevHash + canonicalJson(body));
      if (expected !== r.hash) {
        return { valid: false, checked: rows.length, brokenAtSeq: Number(r.seq) };
      }
      prevHash = String(r.hash);
    }
    return { valid: true, checked: rows.length };
  }

  list(orgId: string, limit = 100, beforeSeq?: number): Row[] {
    if (beforeSeq) {
      return this.db.all(
        "SELECT seq, id, actor_type, actor_id, action, resource_type, resource_id, risk_level, decision, result, created_at FROM audit_events WHERE org_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
        [orgId, beforeSeq, limit]
      );
    }
    return this.db.all(
      "SELECT seq, id, actor_type, actor_id, action, resource_type, resource_id, risk_level, decision, result, created_at FROM audit_events WHERE org_id = ? ORDER BY seq DESC LIMIT ?",
      [orgId, limit]
    );
  }
}

type Row = Record<string, unknown>;

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    throw new AppError("INTERNAL", "audit metadata is not valid JSON");
  }
}
