/**
 * PHASE B1 — genuine governance evaluation (F-07).
 * Pure decision function: the control plane supplies real inputs (budget
 * numbers from BudgetGuard, task ownership/status) and receives a computed,
 * auditable decision. No hardcoded "ALLOW" strings at call sites.
 */

export interface GovernanceInput {
  taskStatus: string;
  orgIdMatches: boolean;
  impactMode: "create" | "modify";
  opsCount: number;
  budgetCheck: {
    allowed: boolean;
    violatedScope?: string;
    limitUsd?: number;
    spentUsd?: number;
  };
}

export interface GovernanceDecision {
  decision: "ALLOW" | "BLOCK";
  reasons: string[];
  complexity: "simple" | "module" | "service";
  impactMode: "create" | "modify";
  riskLevel: "low" | "medium";
  /** service-complexity deliveries require a human approval before run */
  requiresApproval: boolean;
  budgetCheck: GovernanceInput["budgetCheck"];
}

export function evaluateGovernance(input: GovernanceInput): GovernanceDecision {
  const reasons: string[] = [];
  let decision: "ALLOW" | "BLOCK" = "ALLOW";

  const complexity =
    input.opsCount <= 2 ? "simple" : input.opsCount <= 4 ? "module" : "service";
  const riskLevel = input.impactMode === "modify" ? "medium" : "low";

  if (!input.orgIdMatches) {
    decision = "BLOCK";
    reasons.push("task does not belong to requesting organization");
  }
  if (input.taskStatus !== "ready") {
    decision = "BLOCK";
    reasons.push(`task status '${input.taskStatus}' is not dispatchable (must be ready)`);
  }
  if (!input.budgetCheck.allowed) {
    decision = "BLOCK";
    reasons.push(
      `budget exceeded on ${input.budgetCheck.violatedScope}: spent ${input.budgetCheck.spentUsd}/${input.budgetCheck.limitUsd}`
    );
  }

  const requiresApproval = complexity === "service";
  if (requiresApproval) {
    decision = "BLOCK";
    reasons.push("service-complexity delivery requires human approval (delivery:auto)");
  }

  return {
    decision,
    reasons,
    complexity,
    impactMode: input.impactMode,
    riskLevel,
    requiresApproval,
    budgetCheck: input.budgetCheck,
  };
}
