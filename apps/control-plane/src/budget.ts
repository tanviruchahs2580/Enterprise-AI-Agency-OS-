import { newId } from "@agency/core";
import type { Db } from "@agency/db";
import type { BudgetGuard } from "@agency/models";
import type { ModelTier } from "@agency/models";

export type BudgetAction = "allow" | "block" | "downgrade" | "approve_required";

export interface BudgetCheck {
  allowed: boolean;
  violatedScope?: string;
  limitUsd?: number;
  spentUsd?: number;
}

export interface BudgetEvaluation extends BudgetCheck {
  action: BudgetAction;
  /** Present when the violating budget's action is `downgrade`. */
  recommendedTier?: ModelTier;
}

/**
 * Tier the work should move to when a budget calls for downgrade (master
 * prompt §15/§16). REVIEW never downgrades (a cheap review is not a review);
 * FAST/VISION/LOCAL are already the cheapest rung.
 */
export function recommendedTierFor(tier: ModelTier): ModelTier | undefined {
  switch (tier) {
    case "REASONING": return "STANDARD";
    case "SECURITY": return "STANDARD";
    case "STANDARD": return "FAST";
    default: return undefined;
  }
}

/**
 * Multi-scope budget enforcement (master prompt §32).
 * Evaluation order — first violation wins:
 *   request → task → mission → project → org → daily → monthly
 */
export class BudgetGuardImpl implements BudgetGuard {
  private db: Db;
  private getOrgId: () => string;
  constructor(db: Db, getOrgId: () => string) {
    this.db = db;
    this.getOrgId = getOrgId;
  }

  check(estimateUsd: number, scopes: {
    orgId: string;
    projectId?: string;
    missionId?: string;
    taskId?: string;
  }): BudgetCheck {
    const ev = this.evaluate(estimateUsd, scopes);
    return {
      allowed: ev.action === "allow" || ev.action === "downgrade",
      violatedScope: ev.violatedScope,
      limitUsd: ev.limitUsd,
      spentUsd: ev.spentUsd,
    };
  }

  /**
   * Action-aware budget evaluation (Phase 2.4 wiring, previously schema-only):
   *   block           → spend denied
   *   downgrade       → spend allowed, but the router will re-select a cheaper tier
   *   approve_required→ spend denied pending an approval decision (deferred wiring)
   * First violating scope wins, in request → task → mission → project → org →
   * daily → monthly evaluation order.
   */
  evaluate(
    estimateUsd: number,
    scopes: { orgId: string; projectId?: string; missionId?: string; taskId?: string } = {
      orgId: this.getOrgId(),
    },
    currentTier?: ModelTier
  ): BudgetEvaluation {
    const order: { scopeType: string; scopeId: string }[] = [];
    if (scopes.taskId) order.push({ scopeType: "task", scopeId: scopes.taskId });
    if (scopes.missionId) order.push({ scopeType: "mission", scopeId: scopes.missionId });
    if (scopes.projectId) order.push({ scopeType: "project", scopeId: scopes.projectId });
    order.push({ scopeType: "org", scopeId: scopes.orgId });
    order.push({ scopeType: "daily", scopeId: "*" });
    order.push({ scopeType: "monthly", scopeId: "*" });

    for (const s of order) {
      const budget = this.db.get<{ limit_usd: number; action: string }>(
        "SELECT limit_usd, action FROM budgets WHERE org_id = ? AND scope_type = ? AND scope_id = ?",
        [scopes.orgId, s.scopeType, s.scopeId]
      );
      if (!budget) continue;
      const spent = this.spentFor(s.scopeType, s.scopeId, scopes);
      if (spent + estimateUsd > Number(budget.limit_usd)) {
        const action = (budget.action as BudgetAction) || "block";
        if (action === "downgrade") {
          return {
            allowed: true,
            action,
            violatedScope: `${s.scopeType}:${s.scopeId}`,
            limitUsd: Number(budget.limit_usd),
            spentUsd: spent,
            recommendedTier: recommendedTierFor(currentTier ?? "STANDARD"),
          };
        }
        return {
          allowed: false,
          action: action === "approve_required" ? "approve_required" : "block",
          violatedScope: `${s.scopeType}:${s.scopeId}`,
          limitUsd: Number(budget.limit_usd),
          spentUsd: spent,
        };
      }
    }
    return { allowed: true, action: "allow" };
  }

  allowSpend(estimatedUsd: number): boolean {
    // Router-level pre-flight uses default org scope (request-scoped checks
    // happen in the API layer where project/task context is known).
    const orgId = this.getOrgId();
    const action = this.evaluate(estimatedUsd, { orgId }).action;
    return action !== "block" && action !== "approve_required";
  }

  recordSpend(amountUsd: number, scopes?: {
    orgId: string;
    projectId?: string;
    missionId?: string;
    taskId?: string;
    reason?: string;
  }): void {
    if (amountUsd <= 0) return;
    const sc = scopes ?? { orgId: this.getOrgId(), reason: "model-request" };
    const entries: { scope_type: string; scope_id: string }[] = [
      { scope_type: "org", scope_id: sc.orgId },
      { scope_type: "daily", scope_id: "*" },
      { scope_type: "monthly", scope_id: "*" },
    ];
    if (sc.taskId) entries.push({ scope_type: "task", scope_id: sc.taskId });
    if (sc.missionId) entries.push({ scope_type: "mission", scope_id: sc.missionId });
    if (sc.projectId) entries.push({ scope_type: "project", scope_id: sc.projectId });

    for (const e of entries) {
      this.db.insert("cost_events", {
        id: newId("cst"),
        org_id: sc.orgId,
        scope_type: e.scope_type,
        scope_id: e.scope_id,
        amount_usd: amountUsd,
        reason: sc.reason ?? "model-request",
        created_at: this.db.now(),
      });
    }
  }

  /** Spend since period start. daily = today; monthly = calendar month. */
  private spentFor(scopeType: string, scopeId: string, scopes: { orgId: string }): number {
    let since = "";
    if (scopeType === "daily") {
      since = new Date().toISOString().slice(0, 10);
    } else if (scopeType === "monthly") {
      since = new Date().toISOString().slice(0, 7);
    }
    if (scopeType === "daily" || scopeType === "monthly") {
      const row = this.db.get<{ total: number | null }>(
        `SELECT SUM(amount_usd) AS total FROM cost_events
         WHERE org_id = ? AND scope_type = ? AND scope_id = ? AND substr(created_at,1,length(?)) = ?`,
        [scopes.orgId, scopeType, scopeId, since, since]
      );
      return Number(row?.total ?? 0);
    }
    if (scopeType === "org") {
      // Portable 30-day window (ISO string comparison; no SQL date functions).
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
      const row = this.db.get<{ total: number | null }>(
        `SELECT SUM(amount_usd) AS total FROM cost_events
         WHERE org_id = ? AND scope_type = 'org' AND scope_id = ? AND created_at >= ?`,
        [scopes.orgId, scopeId, cutoff]
      );
      return Number(row?.total ?? 0);
    }
    const row = this.db.get<{ total: number | null }>(
      "SELECT SUM(amount_usd) AS total FROM cost_events WHERE scope_type = ? AND scope_id = ?",
      [scopeType, scopeId]
    );
    return Number(row?.total ?? 0);
  }

  summary(orgId: string): Record<string, unknown> {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const rows = this.db.all<{ scope_type: string; total: number }>(
      `SELECT scope_type, SUM(amount_usd) AS total FROM cost_events
       WHERE org_id = ? GROUP BY scope_type`,
      [orgId]
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[String(r.scope_type)] = Number(r.total);

    const daily = this.db.get<{ total: number | null }>(
      "SELECT SUM(amount_usd) AS total FROM cost_events WHERE org_id=? AND scope_type='daily' AND substr(created_at,1,10)=?",
      [orgId, today]
    );
    const monthly = this.db.get<{ total: number | null }>(
      "SELECT SUM(amount_usd) AS total FROM cost_events WHERE org_id=? AND scope_type='monthly' AND substr(created_at,1,7)=?",
      [orgId, month]
    );
    const byModel = this.db.all<{ selected_model: string; total: number; calls: number }>(
      `SELECT selected_model, SUM(cost_usd) AS total, COUNT(*) AS calls
       FROM model_requests WHERE status='succeeded'
       GROUP BY selected_model ORDER BY total DESC LIMIT 10`
    );
    return {
      allTimeByScope: out,
      dailySpend: Number(daily?.total ?? 0),
      monthlySpend: Number(monthly?.total ?? 0),
      byModel,
      budgets: this.db.all("SELECT scope_type, scope_id, limit_usd, action FROM budgets WHERE org_id=?", [orgId]),
    };
  }
}
