import { AppError } from "@agency/core";

/** Task lifecycle (master prompt §11). Invalid transitions are rejected. */
export const TASK_STATES = [
  "draft", "ready", "planned", "in_progress", "review", "qa", "security",
  "approval", "deploying", "deployed", "monitoring", "completed",
  "blocked", "failed", "rollback_required", "cancelled",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

const FLOW: Record<TaskState, TaskState[]> = {
  draft: ["ready", "cancelled"],
  ready: ["planned", "blocked", "cancelled"],
  planned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["review", "failed", "blocked", "cancelled"],
  review: ["qa", "in_progress", "failed", "cancelled"],
  qa: ["security", "in_progress", "failed", "cancelled"],
  security: ["approval", "in_progress", "failed"],
  approval: ["deploying", "in_progress", "cancelled"],
  deploying: ["deployed", "failed", "rollback_required"],
  deployed: ["monitoring", "rollback_required"],
  monitoring: ["completed", "rollback_required"],
  completed: [],
  blocked: ["ready", "planned", "in_progress", "cancelled"],
  failed: ["ready", "planned", "in_progress", "cancelled"],
  rollback_required: ["in_progress", "completed", "cancelled"],
  cancelled: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return (FLOW[from] ?? []).includes(to);
}

export function assertTransition(from: TaskState, to: TaskState): void {
  if (!canTransition(from, to)) {
    throw new AppError("CONFLICT", `illegal task transition ${from} → ${to}`, {
      details: { from, to },
    });
  }
}

export function nextStates(from: TaskState): TaskState[] {
  return [...(FLOW[from] ?? [])];
}
