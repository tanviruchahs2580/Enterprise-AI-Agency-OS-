import { newId, AppError } from "@agency/core";
import type { Db } from "@agency/db";
import { parse } from "yaml";

export interface WorkflowStageDef {
  name: string;
  description?: string;
  agentRole?: string;
  approvalRequired?: boolean;
  approvalAction?: string;
  retry?: { maxAttempts: number };
  timeoutMs?: number;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  stages: WorkflowStageDef[];
}

/** Stage executor supplied by the application layer. */
export type StageHandler = (
  stage: string,
  state: Record<string, unknown>
) => Promise<Record<string, unknown>>;

const DEFAULT_WORKFLOW: WorkflowDefinition = {
  name: "enterprise-feature",
  description: "Default SDLC workflow (master prompt §22)",
  stages: [
    { name: "discovery" },
    { name: "requirements", agentRole: "requirements-engineer" },
    { name: "architecture", agentRole: "architect" },
    { name: "planning", agentRole: "captain" },
    { name: "implementation", agentRole: "backend-engineer", retry: { maxAttempts: 3 } },
    { name: "review", agentRole: "code-reviewer" },
    { name: "security", agentRole: "security-engineer" },
    { name: "qa", agentRole: "qa-engineer" },
    { name: "deployment", agentRole: "devops-engineer", approvalRequired: true, approvalAction: "deploy:staging" },
    { name: "monitoring", agentRole: "sre" },
  ],
};

/**
 * Deterministic, persisted workflow engine (ADR-0005):
 * - definitions are data (YAML or built-in default)
 * - each completed stage is checkpointed into workflow_runs.state_json
 * - runs can pause for human approvals and be resumed later
 * - failures mark the run failed/blocked; resume() continues from the
 *   last completed stage — sessions survive restarts.
 */
export class WorkflowEngine {
  private handlers = new Map<string, Map<string, StageHandler>>();
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  registerHandler(workflowName: string, stage: string, handler: StageHandler): void {
    let m = this.handlers.get(workflowName);
    if (!m) {
      m = new Map();
      this.handlers.set(workflowName, m);
    }
    m.set(stage, handler);
  }

  parseDefinition(source: string): WorkflowDefinition {
    const raw = parse(source) as {
      workflow?: { name?: string; description?: string; stages?: WorkflowStageDef[] };
      stages?: WorkflowStageDef[];
      name?: string;
    };
    const body = raw.workflow ?? raw;
    if (!body?.name || !Array.isArray(body.stages) || body.stages.length === 0) {
      throw new AppError("VALIDATION_ERROR", "workflow definition must have a name and ≥1 stage");
    }
    return body as unknown as WorkflowDefinition;
  }

  start(
    orgId: string,
    opts: { definition?: WorkflowDefinition; projectId?: string; initialState?: Record<string, unknown>; correlationId?: string }
  ): { runId: string; workflow: string; currentStage: string } {
    const defn = opts.definition ?? DEFAULT_WORKFLOW;
    const runId = newId("wfr");
    const now = this.db.now();
    this.db.insert("workflow_runs", {
      id: runId,
      org_id: orgId,
      project_id: opts.projectId ?? null,
      workflow_name: defn.name,
      current_stage: defn.stages[0]!.name,
      status: "running",
      state_json: JSON.stringify({
        definition: defn,
        completedStages: [],
        ...opts.initialState,
      }),
      correlation_id: opts.correlationId ?? newId("cor"),
      created_at: now,
      updated_at: now,
    });
    return { runId, workflow: defn.name, currentStage: defn.stages[0]!.name };
  }

  async advance(runId: string): Promise<{ status: string; currentStage: string | null }> {
    const row = this.db.get<{
      id: string;
      org_id: string;
      workflow_name: string;
      current_stage: string;
      status: string;
      state_json: string;
    }>("SELECT * FROM workflow_runs WHERE id = ?", [runId]);
    if (!row) throw new AppError("NOT_FOUND", `workflow run ${runId} not found`);
    if (row.status !== "running") {
      throw new AppError("CONFLICT", `run is ${row.status}; only running runs can advance`);
    }

    const state = JSON.parse(row.state_json) as {
      definition: WorkflowDefinition;
      completedStages: string[];
    } & Record<string, unknown>;
    const stages = state.definition.stages;

    // find index of current stage
    const idx = stages.findIndex((s) => s.name === row.current_stage);
    if (idx === -1) throw new AppError("INTERNAL", `unknown stage ${row.current_stage}`);
    const stage = stages[idx]!;

    const handler = this.handlers.get(state.definition.name)?.get(stage.name);
    if (!handler) {
      this.setStatus(runId, "blocked");
      throw new AppError("DEPENDENCY_UNAVAILABLE", `no handler registered for stage '${stage.name}'`);
    }

    let output: Record<string, unknown>;
    try {
      output = await handler(stage.name, state);
    } catch (e) {
      this.setStatus(runId, "failed");
      throw new AppError("INTERNAL", `stage '${stage.name}' failed`, { cause: e });
    }

    state.completedStages.push(stage.name);
    Object.assign(state, output);

    const nextIdx = idx + 1;
    if (nextIdx >= stages.length) {
      this.db.transaction(() => {
        this.persistState(runId, state, "__done__");
        this.setStatus(runId, "succeeded");
      });
      return { status: "succeeded", currentStage: null };
    }

    const next = stages[nextIdx]!;
    this.persistState(runId, state, next.name);
    return { status: "running", currentStage: next.name };
  }

  pauseForApproval(runId: string, action: string, resourceRef: Record<string, unknown>): void {
    const row = this.getRunRow(runId);
    const state = JSON.parse(row.state_json) as Record<string, unknown>;
    state.pendingApproval = { action, ...resourceRef };
    this.db.transaction(() => {
      this.persistState(runId, state);
      this.setStatus(runId, "waiting_approval");
    });
  }

  resume(runId: string): { status: string; currentStage: string | null } {
    const row = this.getRunRow(runId);
    if (row.status !== "waiting_approval" && row.status !== "paused" && row.status !== "blocked") {
      throw new AppError("CONFLICT", `cannot resume run in status ${row.status}`);
    }
    this.setStatus(runId, "running");
    return { status: "running", currentStage: String(row.current_stage) };
  }

  getState(orgId: string, runId: string): Row {
    const row = this.db.get("SELECT * FROM workflow_runs WHERE id = ? AND org_id = ?", [runId, orgId]);
    if (!row) throw new AppError("NOT_FOUND", "workflow run not found");
    return row;
  }

  private getRunRow(runId: string): {
    id: string;
    status: string;
    current_stage: string;
    state_json: string;
  } {
    const row = this.db.get("SELECT id, status, current_stage, state_json FROM workflow_runs WHERE id = ?", [
      runId,
    ]) as { id: string; status: string; current_stage: string; state_json: string } | undefined;
    if (!row) throw new AppError("NOT_FOUND", `workflow run ${runId} not found`);
    return row;
  }

  private persistState(runId: string, state: unknown, currentStageOverride?: string): void {
    const patch: Record<string, unknown> = {
      state_json: JSON.stringify(state),
      updated_at: this.db.now(),
    };
    if (currentStageOverride) patch.current_stage = currentStageOverride;
    this.db.updateById("workflow_runs", runId, patch);
  }

  private setStatus(runId: string, status: string): void {
    this.db.updateById("workflow_runs", runId, { status, updated_at: this.db.now() });
  }
}

type Row = Record<string, unknown>;

export function defaultWorkflowDefinition(): WorkflowDefinition {
  return structuredClone(DEFAULT_WORKFLOW);
}
