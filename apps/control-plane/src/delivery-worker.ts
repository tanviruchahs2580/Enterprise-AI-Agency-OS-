import type { AppContext } from "./context.ts";
import { executeDelivery } from "./delivery.ts";
import { AppError } from "@agency/core";

/** Errors that must never be retried (policy/config semantics, not transient). */
function isPermanentDeliveryError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  return (
    msg.startsWith("governance BLOCK") ||
    msg.includes("requires MODEL_PROVIDER_API_KEY") ||
    msg.startsWith("governance:")
  );
}

/**
 * Autonomous delivery worker (v0.5.0): executes the closed loop
 * worktree→generate→test→self-heal→review→commit→merge for delivery tasks.
 */
export function registerDeliveryWorkers(ctx: AppContext): void {
  ctx.jobs.register("deliver_task", async (job) => {
    const data = (job.payload as { data?: Record<string, unknown> }).data ?? {};
    const executionId = String(data.executionId ?? "");
    const taskId = String(data.taskId ?? "");
    if (!executionId || !taskId) throw new Error("deliver_task job missing ids");

    const exec = ctx.db.get<{ org_id: string; task_id: string }>(
      "SELECT org_id, task_id FROM executions WHERE id=?",
      [executionId]
    );
    if (!exec) throw new Error(`execution ${executionId} not found`);

    try {
      await executeDelivery(ctx, {
        orgId: exec.org_id,
        taskId,
        projectId: String(
          ctx.db.get<{ project_id: string }>("SELECT project_id FROM tasks WHERE id=?", [taskId])!
            .project_id
        ),
        executionId,
        injectFault: Boolean(data.injectFault),
        maxRepairAttempts: data.maxRepairAttempts ? Number(data.maxRepairAttempts) : 2,
        testsTimeoutMs: data.testsTimeoutMs ? Number(data.testsTimeoutMs) : undefined,
      });
    } catch (e) {
      // Permanent policy/config failures → dead-letter quietly (no retry storm).
      if (
        (e instanceof AppError && e.code === "VALIDATION_ERROR") ||
        isPermanentDeliveryError(e)
      ) {
        // Preserve a more specific error_code already recorded by the
        // governance layer (e.g. GOVERNANCE_BLOCKED / APPROVAL_REQUIRED).
        ctx.db.run(
          `UPDATE executions SET status='failed', finished_at=?, error_code=COALESCE(error_code, ?) WHERE id=? AND status NOT IN ('succeeded','failed')`,
          [ctx.db.now(), e instanceof AppError && e.code === "VALIDATION_ERROR" ? "INVALID_SPEC" : "DELIVERY_BLOCKED", executionId]
        );
        ctx.db.run("UPDATE jobs SET status='dead_letter', last_error=? WHERE id=?", [
          String((e as Error).message ?? e),
          job.id,
        ]);
        return;
      }
      throw e;
    }
  });
}
