import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { AppError, newId } from "@agency/core";
import type { AppContext } from "./context.ts";

/**
 * Autonomous delivery loop wiring (v0.5.0):
 *   POST /api/v1/delivery/runs {taskId, injectFault?}
 *
 * Task.description must carry a DeliverySpec JSON:
 *   {"kind":"delivery","moduleName":"calculator","ops":[{"name":"add","arity":2}]}
 *
 * The worker:
 *   ensures a managed git repo for the project (data/repos/<slug>)
 *   → runs the closed pipeline (worktree→generate→test→self-heal→review→
 *     commit→merge)
 *   → records artifacts + handoff knowledge + quality receipt + audit events.
 */

export function ensureProjectRepo(ctx: AppContext, orgId: string, projectId: string): string {
  const project = ctx.db.get<{ slug: string; name: string }>(
    "SELECT slug, name FROM projects WHERE id=? AND org_id=?",
    [projectId, orgId]
  );
  if (!project) throw new AppError("NOT_FOUND", "project not found");
  const repoPath = join(process.cwd(), "data", "repos", `${String(project.slug)}-${projectId.slice(-6)}`);
  const gitDir = join(repoPath, ".git");
  if (!existsSync(gitDir)) {
    mkdirSync(repoPath, { recursive: true });
    const g = (a: string[]) => execFileSync("git", a, { cwd: repoPath });
    g(["init", "-b", "main"]);
    g(["config", "user.email", "agency@localhost"]);
    g(["config", "user.name", "Agency OS Delivery"]);
    // seed commit so worktree creation has a base
    writeFileSync(join(repoPath, "README.md"), `# ${String(project.name)}\nManaged by Agency OS.\n`);
    g(["add", "-A"]);
    g(["commit", "-m", "chore: repository initialized by Agency OS"]);
  }
  return repoPath;
}

export interface DeliveryRunResult {
  executionId: string;
  traceId: string;
  ok?: boolean;
  blocked?: string;
  attempts?: { n: number; passed: boolean; failedTests: number; diagnosis?: string }[];
  review?: { verdict: string; findings: unknown[] };
  commitSha?: string;
  mergedBranch?: string;
  stages?: { stage: string; at: string; detail: Record<string, unknown> }[];
}

/** Synchronous delivery used by the worker job handler. */
export async function executeDelivery(
  ctx: AppContext,
  opts: {
    orgId: string;
    taskId: string;
    projectId: string;
    executionId: string;
    injectFault: boolean;
    maxRepairAttempts?: number;
  }
): Promise<DeliveryRunResult> {
  const task = ctx.db.get<{ title: string; description: string; status: string }>(
    "SELECT title, description, status FROM tasks WHERE id=? AND org_id=?",
    [opts.taskId, opts.orgId]
  );
  if (!task) throw new AppError("NOT_FOUND", "task not found");

  let spec: unknown;
  try {
    spec = JSON.parse(String(task.description));
  } catch {
    throw new AppError("VALIDATION_ERROR", "task description must be DeliverySpec JSON");
  }
  const s = spec as { kind?: string; moduleName?: string; ops?: unknown[] };
  if (s.kind !== "delivery" || !s.moduleName || !Array.isArray(s.ops)) {
    throw new AppError("VALIDATION_ERROR", "description is not a valid DeliverySpec");
  }

  const { runDeliveryPipeline } = await import("@agency/delivery");
  const { TemplateCodegen } = await import("@agency/delivery");

  const repoPath = ensureProjectRepo(ctx, opts.orgId, opts.projectId);

  ctx.db.updateById("executions", opts.executionId, {
    status: "running",
    started_at: ctx.db.now(),
  });

  const out = await runDeliveryPipeline({
    repoPath,
    taskId: opts.taskId,
    spec: spec as never,
    codegen: new TemplateCodegen(),
    injectFault: opts.injectFault,
    maxRepairAttempts: opts.maxRepairAttempts ?? 2,
    onStage: (stage, detail) => {
      ctx.bus.emit({
        type: `Delivery.${stage}`,
        orgId: opts.orgId,
        actorType: "system",
        actorId: "delivery-worker",
        payload: { executionId: opts.executionId, ...detail },
      });
    },
  });

  const receipt = out.ok
    ? ctx.tasks.issueQualityReceipt(opts.taskId, {
        tests: "passed",
        security: "passed", // reviewer secret gate passed
        review: out.review?.verdict === "APPROVE" ? "passed" : "failed",
        commit: out.commitSha ?? null,
      })
    : undefined;

  ctx.db.updateById("executions", opts.executionId, {
    status: out.ok ? "succeeded" : "failed",
    finished_at: ctx.db.now(),
    output_summary: out.ok
      ? `delivered ${out.files.length} files via ${out.mergedBranch}`
      : `blocked: ${out.blocked}`,
    error_code: out.ok ? null : "DELIVERY_BLOCKED",
    sandbox_id: out.worktreePath ?? null,
  });

  if (out.ok) {
    // walk legal path to review: ready→planned→in_progress→review
    const cur = ctx.db.get<{ status: string }>(
      "SELECT status FROM tasks WHERE id = ?",
      [opts.taskId]
    );
    const st = String(cur?.status ?? "");
    try {
      if (st === "ready") ctx.tasks.transition(opts.taskId, "planned");
      const cur2 = ctx.db.get<{ status: string }>(
        "SELECT status FROM tasks WHERE id = ?",
        [opts.taskId]
      );
      if (String(cur2?.status) === "planned" || st === "in_progress") {
        ctx.tasks.transition(opts.taskId, "in_progress");
      }
      ctx.tasks.transition(opts.taskId, "review");
    } catch { /* concurrent state change — receipt already recorded */ }

    ctx.db.insert("knowledge_documents", {
      id: newId("knw"),
      org_id: opts.orgId,
      project_id: opts.projectId,
      kind: "handoff",
      title: `Delivered: ${String(task.title)}`,
      content: JSON.stringify({
        requested: String(task.title),
        produced: out.files.map((f) => f.path),
        commit: out.commitSha,
        branch: out.mergedBranch,
        repairAttempts: out.attempts.length - 1,
        review: out.review?.verdict,
      }),
      tags: JSON.stringify(["delivery", opts.executionId]),
      confidence: 1,
      verification_status: "verified",
      created_by: "delivery-worker",
      created_at: ctx.db.now(),
      updated_at: ctx.db.now(),
    });

    ctx.audit.append({
      orgId: opts.orgId,
      actorType: "agent",
      actorId: "delivery-worker",
      action: "delivery.completed",
      resourceType: "execution",
      resourceId: opts.executionId,
      riskLevel: "medium",
      metadata: { taskId: opts.taskId, commit: out.commitSha, files: out.files.map((f) => f.path) },
    });
  } else {
    ctx.audit.append({
      orgId: opts.orgId,
      actorType: "agent",
      actorId: "delivery-worker",
      action: "delivery.blocked",
      resourceType: "execution",
      resourceId: opts.executionId,
      riskLevel: "high",
      decision: "deny",
      result: "failure",
      metadata: { taskId: opts.taskId, reason: out.blocked },
    });
  }

  void receipt;
  return { executionId: opts.executionId, traceId: "", ...out } as DeliveryRunResult;
}
