import { AppError, newId, sha256Hex } from "@agency/core";
import type { Db } from "@agency/db";
import { assertTransition, type TaskState } from "./statemachine.ts";

export interface CreateTaskInput {
  orgId: string;
  projectId: string;
  title: string;
  description?: string;
  workstreamId?: string;
  missionId?: string;
  type?: string;
  priority?: number;
  createdBy: string;
  dependsOn?: string[];
}

export interface QualityReceipt {
  taskId: string;
  tests: "passed" | "failed" | "skipped";
  security: "passed" | "failed" | "skipped";
  review: "passed" | "failed" | "skipped";
  coverageLine?: number;
  coverageBranch?: number;
  commit: string | null;
  issuedAt: string;
  hash: string;
}

/**
 * Task system with dependency-graph integrity:
 * cycle detection, ready-queue computation, guarded transitions,
 * and verifiable quality receipts.
 */
export class TaskService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  create(input: CreateTaskInput): { id: string; state: TaskState } {
    const id = newId("tsk");
    const now = this.db.now();
    this.db.transaction(() => {
      this.db.insert("tasks", {
        id,
        org_id: input.orgId,
        project_id: input.projectId,
        workstream_id: input.workstreamId ?? null,
        mission_id: input.missionId ?? null,
        title: input.title,
        description: input.description ?? "",
        type: input.type ?? "implementation",
        priority: input.priority ?? 3,
        status: "draft",
        created_by: input.createdBy,
        created_at: now,
        updated_at: now,
      });
      for (const dep of input.dependsOn ?? []) {
        this.addDependency(id, dep);
      }
    });
    return { id, state: "draft" };
  }

  /** Adds edge `taskId` depends on `dependsOn`; rejects cycles. */
  addDependency(taskId: string, dependsOn: string): void {
    if (taskId === dependsOn) {
      throw new AppError("VALIDATION_ERROR", "task cannot depend on itself");
    }
    // would adding this edge create a cycle? (dependsOn reaches taskId already?)
    if (this.reaches(dependsOn, taskId)) {
      throw new AppError("CONFLICT", "dependency would create a cycle", {
        details: { taskId, dependsOn },
      });
    }
    this.db.insert("task_dependencies", {
      id: newId("dep"),
      task_id: taskId,
      depends_on_task_id: dependsOn,
      kind: "blocks",
      created_at: this.db.now(),
    });
  }

  /** DFS reachability: does `from` reach `to` via dependency edges (task→dep)? */
  private reaches(from: string, to: string, seen = new Set<string>()): boolean {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    const rows = this.db.all<{ depends_on_task_id: string }>(
      "SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?",
      [from]
    );
    for (const r of rows) {
      if (this.reaches(String(r.depends_on_task_id), to, seen)) return true;
    }
    return false;
  }

  /** Tasks whose dependencies are all completed → eligible for dispatch. */
  readyQueue(projectId: string): RowTask[] {
    return this.db.all<RowTask>(
      `SELECT t.* FROM tasks t
       WHERE t.project_id = ? AND t.status IN ('draft','ready')
         AND NOT EXISTS (
           SELECT 1 FROM task_dependencies d
           JOIN tasks dep ON dep.id = d.depends_on_task_id
           WHERE d.task_id = t.id AND dep.status != 'completed'
         )
       ORDER BY t.priority ASC, t.created_at ASC`,
      [projectId]
    ) as RowTask[];
  }

  transition(taskId: string, to: TaskState): { from: TaskState; to: TaskState; version: number } {
    return this.db.transaction(() => {
      const row = this.db.get<RowTask>("SELECT * FROM tasks WHERE id = ?", [taskId]);
      if (!row) throw new AppError("NOT_FOUND", `task ${taskId} not found`);
      const from = String(row.status) as TaskState;
      assertTransition(from, to);
      const ok = this.db.updateById(
        "tasks",
        taskId,
        { status: to, updated_at: this.db.now() },
        { expectedVersion: Number(row.version), bumpVersion: true }
      );
      if (!ok) throw new AppError("CONFLICT", "concurrent modification detected");
      return { from, to, version: Number(row.version) + 1 };
    });
  }

  assign(taskId: string, agentId: string): void {
    const row = this.db.get<RowTask>("SELECT * FROM tasks WHERE id = ?", [taskId]);
    if (!row) throw new AppError("NOT_FOUND", `task ${taskId} not found`);
    const ok = this.db.updateById(
      "tasks",
      taskId,
      { assignee_agent_id: agentId, updated_at: this.db.now() },
      { expectedVersion: Number(row.version), bumpVersion: true }
    );
    if (!ok) throw new AppError("CONFLICT", "concurrent modification detected");
  }

  /**
   * Issue a machine-verifiable quality receipt (QGR). The receipt hash chains
   * the verification facts so downstream consumers can detect tampering.
   */
  issueQualityReceipt(
    taskId: string,
    data: Omit<QualityReceipt, "taskId" | "issuedAt" | "hash">
  ): QualityReceipt {
    const issuedAt = this.db.now();
    const body = JSON.stringify({ ...data, taskId, issuedAt });
    const receipt: QualityReceipt = {
      taskId,
      tests: data.tests,
      security: data.security,
      review: data.review,
      coverageLine: data.coverageLine,
      coverageBranch: data.coverageBranch,
      commit: data.commit,
      issuedAt,
      hash: sha256Hex(body),
    };
    this.db.updateById("tasks", taskId, {
      quality_receipt: JSON.stringify(receipt),
      updated_at: issuedAt,
    });
    return receipt;
  }
}

type Row = Record<string, unknown>;
interface RowTask extends Row {
  id: string;
  status: string;
  version: number;
}
