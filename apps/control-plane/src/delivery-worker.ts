import type { AppContext } from "./context.ts";
import { executeDelivery } from "./delivery.ts";
import { AppError } from "@agency/core";

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
      });
    } catch (e) {
      if (e instanceof AppError && e.code === "VALIDATION_ERROR") {
        // permanent — do not retry; fail the execution and dead-letter quietly
        ctx.db.updateById("executions", executionId, {
          status: "failed",
          finished_at: ctx.db.now(),
          error_code: "INVALID_SPEC",
        });
        ctx.db.run("UPDATE jobs SET status='dead_letter', last_error=? WHERE id=?", [
          e.message,
          job.id,
        ]);
        return;
      }
      throw e;
    }
  });
}
