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
  description:
    "Enterprise SDLC — parallel discovery, shift-left threat model, dual-axis review, and full 24-agent coverage. Fan-outs run concurrently; wall time is governed by the critical path, not the stage count.",
  stages: [
    {
      name: "discovery",
      description: "Parallel discovery: product intent, cited research, and UX foundations",
      fanOut: [
        { name: "product-discovery", agentRole: "product-manager", description: "PRD slice, story decomposition" },
        { name: "market-research", agentRole: "research-agent", description: "Cited primary sources with source/date/confidence" },
        { name: "ux-discovery", agentRole: "ux-designer", description: "Flows, states, a11y foundations" },
      ],
    },
    { name: "requirements", agentRole: "requirements-engineer", description: "SRS, edge cases, DoR gate" },
    {
      name: "architecture",
      description: "Parallel system design: C4/ADR, threat model (shift-left), and data contracts",
      fanOut: [
        { name: "system-design", agentRole: "architect", description: "C4, ADRs, Plan-lock" },
        { name: "threat-model", agentRole: "security-engineer", description: "STRIDE during design, not after code" },
        { name: "data-model", agentRole: "database-engineer", description: "Reversible migrations, query performance" },
        { name: "analytics-spec", agentRole: "data-analytics-engineer", description: "Metrics definitions, query contracts" },
      ],
    },
    {
      name: "planning",
      description: "Decompose, estimate, and cost",
      fanOut: [
        { name: "sprint-planning", agentRole: "captain", description: "Decompose, dispatch, handoff contracts" },
        { name: "cost-plan", agentRole: "finops-agent", description: "Budget impact per option" },
      ],
    },
    { name: "approval", agentRole: "principal", description: "Vision/high-risk gate — ADRs approved before build" },
    {
      name: "implementation",
      description: "Parallel build tracks — backend, frontend, i18n, and cross-cutting modules",
      fanOut: [
        { name: "backend", agentRole: "backend-engineer", retry: { maxAttempts: 3 }, description: "APIs/services with TDD" },
        { name: "frontend", agentRole: "frontend-engineer", retry: { maxAttempts: 2 }, description: "Accessible, responsive UI + e2e" },
        { name: "localization", agentRole: "localization-engineer", retry: { maxAttempts: 2 }, description: "Externalized strings, locale bundles, RTL/plural" },
        { name: "deep-module", agentRole: "staff-engineer", retry: { maxAttempts: 3 }, description: "Cross-cutting design & refactors" },
      ],
    },
    {
      name: "review",
      description: "Two-axis review in parallel — standards and spec-fidelity",
      fanOut: [
        { name: "standards-review", agentRole: "code-reviewer", description: "Standards, smells, tests quality (blocking/non-blocking)" },
        { name: "adversarial-review", agentRole: "adversarial-reviewer", description: "Spec-fidelity, attack cases" },
      ],
    },
    { name: "security", agentRole: "security-engineer", description: "Final SAST/DAST + threat review gate (no critical/high open at merge)" },
    {
      name: "qa",
      description: "Coverage + performance in parallel",
      fanOut: [
        { name: "coverage-gate", agentRole: "qa-engineer", description: "≥80% line / ≥60% branch on touched code + acceptance criteria" },
        { name: "perf-benchmark", agentRole: "performance-engineer", description: "Before/after baselines, load test" },
      ],
    },
    { name: "documentation", agentRole: "documentation-engineer", description: "Diataxis map — reference + how-to priority" },
    { name: "release", agentRole: "release-manager", description: "SemVer, changelog, rollback plan" },
    { name: "deployment", agentRole: "devops-engineer", approvalRequired: true, approvalAction: "deploy:staging", description: "Pipeline green + SBOM (approval gate)" },
    { name: "monitoring", agentRole: "sre", description: "SLOs, error budgets, runbooks" },
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
   * Fan-Out V2 — per-branch state (§18, §50-51). Preserves successful branches,
   * checkpoints each branch individually, retries only failed branches.
   * Convergence policy: all branches must PASS to advance (future: majority/any).
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
    // Per-branch checkpointing (§50-51): preserve successes, retry only failures
    const fanOut = stage.fanOut ?? [];
    const completed = new Set(state.completedStages as string[]);
    const branchState = (state[stage.name] as Record<string, unknown>) ?? {};
    // Filter to branches not yet completed
    const pending = fanOut.filter((b) => !completed.has(b.name));
    if (pending.length === 0) {
      // All branches already completed — converge
      state.completedStages.push(stage.name);
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
    const results = await Promise.allSettled(
      pending.map(async (branch) => {
        const h = this.handlers.get(workflowName)?.get(branch.name);
        if (!h) throw new AppError("DEPENDENCY_UNAVAILABLE", `no handler for branch '${branch.name}'`);
        const output = await h(branch.name, { ...state, $branch: branch.name, $fanOut: stage.name });
        return { branch: branch.name, output };
      })
    );
    const successes: { branch: string; output: unknown }[] = [];
    const failures: { branch: string; error: unknown }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const branch = pending[i]!.name;
      if (r.status === "fulfilled") successes.push(r.value);
      else failures.push({ branch, error: (r as PromiseRejectedResult).reason });
    }
    // Checkpoint successes immediately
    const merged = { ...(branchState as object) } as Record<string, unknown>;
    for (const s of successes) {
      merged[s.branch] = s.output;
      if (!completed.has(s.branch)) state.completedStages.push(s.branch);
    }
    state[stage.name] = merged;
    this.persistState(runId, state, stage.name, codec);
    if (failures.length > 0) {
      // Preserve successes, stay on same stage for retry of failures
      const msg = failures.map((f) => `${f.branch}: ${String((f.error as Error)?.message ?? f.error)}`).join("; ");
      // Do not mark run failed — allow retry of failed branches (bounded by caller)
      throw new AppError("INTERNAL", `fan-out '${stage.name}' partial failure (${failures.length}/${fanOut.length}): ${msg}`);
    }
    // All pending succeeded — check if all branches now done
    const allDone = fanOut.every((b) => (state.completedStages as string[]).includes(b.name));
    if (allDone) {
      state.completedStages.push(stage.name);
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
    // Should not reach — remain on same stage
    return { status: "running", currentStage: stage.name };
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
