import type { AppContext } from "./context.ts";
import { newId } from "@agency/core";

/**
 * PHASE B4 — specialist agent handlers (flag FEATURE_AGENT_SPECIALISTS).
 * Deterministic-first implementations; each persists a knowledge document so
 * downstream agents (and humans) can pick up structured context.
 */

export function pmDecompose(
  ctx: AppContext,
  args: { orgId: string; projectId?: string; taskId: string; title: string; description?: string }
): { id: string } {
  const parts = [args.title, args.description ?? ""].join(". ").split(/[.;]\s*/).filter(Boolean).slice(0, 3);
  const stories = parts.map((p, i) => ({
    id: `US-${i + 1}`, as: "product owner", want: p.trim(), acceptance: [`AC-${i + 1}A`, `AC-${i + 1}B`],
  }));
  const id = newId("knw");
  ctx.db.insert("knowledge_documents", {
    id, org_id: args.orgId, project_id: args.projectId ?? null, kind: "fact",
    title: `Stories ${args.taskId}`,
    content: JSON.stringify({ stories }),
    tags: JSON.stringify(["stories", args.taskId]),
    confidence: 0.9, verification_status: "verified",
    created_by: "product-manager", created_at: ctx.db.now(), updated_at: ctx.db.now(),
  });
  return { id };
}

/** Definition-of-Ready validator (deterministic). */
export function reqReadinessCheck(task: { title: string; description: string }): string[] {
  const warnings: string[] = [];
  if (task.title.trim().length < 8) warnings.push("title shorter than 8 chars");
  if (!task.description || task.description.trim() === "") warnings.push("empty description");
  return warnings;
}

export function architectAdrDraft(
  ctx: AppContext,
  args: { orgId: string; projectId?: string; taskId: string; moduleName: string }
): { id: string } {
  const id = newId("knw");
  ctx.db.insert("knowledge_documents", {
    id, org_id: args.orgId, project_id: args.projectId ?? null, kind: "decision",
    title: `ADR Draft ${args.moduleName} (modify-mode)`,
    content: JSON.stringify({
      context: `Modify-mode delivery touches existing module '${args.moduleName}'.`,
      decision: "Proceed behind contract gate + post-merge verification.",
      alternatives: ["full rewrite", "feature-flag dual-ship"],
      consequences: "Blast radius limited by gates; rollback via revert runbook.",
    }),
    tags: JSON.stringify(["adr-draft", args.taskId]),
    confidence: 0.8, verification_status: "verified",
    created_by: "architect", created_at: ctx.db.now(), updated_at: ctx.db.now(),
  });
  return { id };
}

export function srePostDeployCheck(
  ctx: AppContext,
  args: { orgId: string; deploymentId: string; projectId?: string }
): { id: string } {
  const id = newId("knw");
  ctx.db.insert("knowledge_documents", {
    id, org_id: args.orgId, project_id: args.projectId ?? null, kind: "operational",
    title: `SLO stub for deployment ${args.deploymentId}`,
    content: JSON.stringify({
      availabilityTarget: "99.9%",
      latencyP95BudgetMs: 500,
      errorRateBudgetPct: 1,
      nextReviewHours: 24,
      status: "monitoring",
    }),
    tags: JSON.stringify(["slo", args.deploymentId]),
    confidence: 0.8, verification_status: "verified",
    created_by: "sre", created_at: ctx.db.now(), updated_at: ctx.db.now(),
  });
  return { id };
}
