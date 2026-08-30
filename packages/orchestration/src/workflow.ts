import { newId, AppError, PASSTHROUGH_CODEC, type FieldCodec } from "@agency/core";
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
  /** Audit Phase 2.2: skipped automatically for low-risk runs. */
  lowRiskSkip?: boolean;
  /**
   * Audit Phase 3.2: parallel fan-out. When set, this stage fans out into the
   * listed sub-stages, executed concurrently. The run converges (advances to
   * the next stage) only after every branch completes; per-branch outputs are
   * checkpointed under `state[stageName][branchName]`.
   */
  fanOut?: WorkflowStageDef[];
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  stages: WorkflowStageDef[];
}

export type RiskTier = "low" | "medium" | "high";

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
  private codecFor: (orgId: string) => FieldCodec;

  constructor(
    db: Db,
    opts?: { codecFor?: (orgId: string) => FieldCodec }
  ) {
    this.db = db;
    this.codecFor = opts?.codecFor ?? (() => PASSTHROUGH_CODEC);
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
    opts: {
      definition?: WorkflowDefinition;
      projectId?: string;
      initialState?: Record<string, unknown>;
      correlationId?: string;
      riskTier?: RiskTier;
    }
  ): { runId: string; workflow: string; currentStage: string } {
    const defn = opts.definition ?? DEFAULT_WORKFLOW;
    const riskTier = opts.riskTier ?? "medium"; // conservative default
    const runId = newId("wfr");
    const now = this.db.now();
    this.db.insert("workflow_runs", {
      id: runId,
      org_id: orgId,
      project_id: opts.projectId ?? null,
      workflow_name: defn.name,
      current_stage: defn.stages[0]!.name,
      status: "running",
      state_json: this.codecFor(orgId).encrypt(
        JSON.stringify({
          definition: defn,
          riskTier,
          completedStages: [],
          ...opts.initialState,
        })
      ),
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

    const codec = this.codecFor(row.org_id);
    const state = JSON.parse(codec.decrypt(row.state_json)) as {
      definition: WorkflowDefinition;
      completedStages: string[];
      riskTier?: RiskTier;
    } & Record<string, unknown>;
    const stages = state.definition.stages;
    const riskTier: RiskTier = state.riskTier ?? "medium";

    // find index of current stage
    let idx = stages.findIndex((s) => s.name === row.current_stage);
    if (idx === -1) throw new AppError("INTERNAL", `unknown stage ${row.current_stage}`);

    // Audit Phase 2.2 — risk-tier pruning: low-risk runs advance through
    // stages flagged lowRiskSkip without executing them, checkpointing each skip
    // so the run state stays consistent and resumable.
    while (idx < stages.length && riskTier === "low" && stages[idx]!.lowRiskSkip === true) {
      state.completedStages.push(stages[idx]!.name);
      idx++;
      if (idx >= stages.length) {
        this.db.transaction(() => {
          this.persistState(runId, state, "__done__", codec);
          this.setStatus(runId, "succeeded");
        });
        return { status: "succeeded", currentStage: null };
      }
      this.persistState(runId, state, stages[idx]!.name, codec);
    }

    const stage = stages[idx]!;

    // Audit Phase 3.2 — parallel fan-out: branch handlers run concurrently and
    // the run only converges when every branch has completed.
    if (stage.fanOut && stage.fanOut.length > 0) {
      return this.advanceFanOut(runId, state, stages, idx, stage, codec);
    }

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
        this.persistState(runId, state, "__done__", codec);
        this.setStatus(runId, "succeeded");
      });
      return { status: "succeeded", currentStage: null };
    }

    const next = stages[nextIdx]!;
    this.persistState(runId, state, next.name, codec);
    return { status: "running", currentStage: next.name };
  }

  /**
   * Runs the fan-out branches of `stage` concurrently (Promise.all) and merges
   * the outputs under `state[stage.name][branch.name]`. A branch failure marks
   * the whole run failed — partial branch work is never checkpointed as
   * converged because the run only persists state after all branches resolve.
   */
  private async advanceFanOut(
    runId: string,
    state: { definition: WorkflowDefinition; completedStages: string[]; riskTier?: RiskTier } & Record<string, unknown>,
    stages: WorkflowStageDef[],
    idx: number,
    stage: WorkflowStageDef,
    codec: FieldCodec
  ): Promise<{ status: string; currentStage: string | null }> {
    const workflowName = state.definition.name;
    try {
      const branches = await Promise.all(
        (stage.fanOut ?? []).map(async (branch) => {
          const h = this.handlers.get(workflowName)?.get(branch.name);
          if (!h) {
            throw new AppError("DEPENDENCY_UNAVAILABLE", `no handler registered for fan-out branch '${branch.name}'`);
          }
          try {
            const output = await h(branch.name, { ...state, $branch: branch.name, $fanOut: stage.name });
            return { branch: branch.name, output };
          } catch (e) {
            throw new AppError("INTERNAL", `branch '${branch.name}' (fan-out '${stage.name}') failed`, { cause: e });
          }
        })
      );
      state[stage.name] = Object.fromEntries(branches.map((b) => [b.branch, b.output]));
      for (const b of branches) state.completedStages.push(b.branch);
      state.completedStages.push(stage.name);
    } catch (e) {
      this.setStatus(runId, "failed");
      throw e instanceof AppError ? e : new AppError("INTERNAL", `fan-out '${stage.name}' failed`, { cause: e });
    }

    const nextIdx = idx + 1;
    if (nextIdx >= stages.length) {
      this.db.transaction(() => {
        this.persistState(runId, state, "__done__", codec);
        this.setStatus(runId, "succeeded");
      });
      return { status: "succeeded", currentStage: null };
    }
    const next = stages[nextIdx]!;
    this.persistState(runId, state, next.name, codec);
    return { status: "running", currentStage: next.name };
  }

  pauseForApproval(runId: string, action: string, resourceRef: Record<string, unknown>): void {
    const row = this.getRunRow(runId);
    const state = JSON.parse(row.state_json) as Record<string, unknown>;
    state.pendingApproval = { action, ...resourceRef };
    const codec = this.codecFor(row.org_id);
    this.db.transaction(() => {
      this.persistState(runId, state, undefined, codec);
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
    // Decrypt state before handing it to callers — ciphertext never leaves the engine.
    return { ...row, state_json: this.codecFor(orgId).decrypt(String(row.state_json)) };
  }

  private getRunRow(runId: string): {
    id: string;
    org_id: string;
    status: string;
    current_stage: string;
    state_json: string;
  } {
    const row = this.db.get(
      "SELECT id, org_id, status, current_stage, state_json FROM workflow_runs WHERE id = ?",
      [runId]
    ) as
      | { id: string; org_id: string; status: string; current_stage: string; state_json: string }
      | undefined;
    if (!row) throw new AppError("NOT_FOUND", `workflow run ${runId} not found`);
    return {
      ...row,
      state_json: this.codecFor(row.org_id).decrypt(row.state_json),
    };
  }

  private persistState(
    runId: string,
    state: unknown,
    currentStageOverride: string | undefined,
    codec: FieldCodec
  ): void {
    const patch: Record<string, unknown> = {
      state_json: codec.encrypt(JSON.stringify(state)),
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
