import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { AppError, newId, sha256Hex } from "@agency/core";
import type { AppContext } from "./context.ts";

/**
 * Phase A/F-07: fault injection and oversized repair budgets are dev-only
 * tools; production dispatches must not carry them.
 */
export function assertDeliveryDemoFlags(
  env: { NODE_ENV?: string },
  body: { injectFault?: unknown; maxRepairAttempts?: unknown }
): void {
  if (env.NODE_ENV !== "production") return;
  if (body.injectFault) {
    throw new AppError("VALIDATION_ERROR", "fault injection disabled in production");
  }
  const attempts = body.maxRepairAttempts === undefined ? undefined : Number(body.maxRepairAttempts);
  if (attempts !== undefined && (!Number.isFinite(attempts) || attempts > 5)) {
    throw new AppError("VALIDATION_ERROR", "maxRepairAttempts limited to 5 in production");
  }
}

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
    testsTimeoutMs?: number;
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

  const repoPath = ensureProjectRepo(ctx, opts.orgId, opts.projectId);

  // ================= PHASE 0 — genuine governance evaluation =================
  const startedAtMs = Date.now();
  const opsCount = Array.isArray(s.ops) ? s.ops.length : 0;
  const impactMode: "create" | "modify" =
    existsSync(join(repoPath, "src", `${s.moduleName}.js`)) ? "modify" : "create";

  const budgetCheck = ctx.budget.check(0, {
    orgId: opts.orgId, projectId: opts.projectId, taskId: opts.taskId,
  });
  const { evaluateGovernance } = await import("@agency/orchestration");
  const gov = evaluateGovernance({
    taskStatus: String(task?.status ?? ""),
    orgIdMatches: true,
    impactMode,
    opsCount,
    budgetCheck,
  });

  ctx.bus.emit({ type: "Governance.classified", orgId: opts.orgId, actorType: "system", actorId: "delivery-worker",
    payload: { executionId: opts.executionId, complexity: gov.complexity, riskLevel: gov.riskLevel, estimatedCostUsd: 0, opsCount } });
  ctx.bus.emit({ type: "Governance.gate", orgId: opts.orgId, actorType: "system", actorId: "delivery-worker",
    payload: { executionId: opts.executionId, decision: gov.decision, reasons: gov.reasons, budgetCheck: gov.budgetCheck, requiresApproval: gov.requiresApproval } });
  ctx.bus.emit({ type: "Governance.impact", orgId: opts.orgId, actorType: "system", actorId: "delivery-worker",
    payload: { executionId: opts.executionId, mode: gov.impactMode, breakingRisk: gov.impactMode === "modify" ? "medium" : "none",
      safeguards: ["contract gate", "post-merge verification"] } });

  if (gov.requiresApproval) {
    const apr = ctx.approvals.request({
      orgId: opts.orgId, projectId: opts.projectId,
      action: "delivery:auto", resourceType: "execution", resourceId: opts.executionId,
      reason: `service-complexity delivery (${opsCount} ops)`,
      riskLevel: "high", requestedBy: "delivery-worker",
    });
    ctx.db.updateById("executions", opts.executionId, {
      status: "failed", finished_at: ctx.db.now(),
      error_code: "APPROVAL_REQUIRED",
      output_summary: `blocked by governance: ${gov.reasons.join("; ")}. approval=${apr.id}`,
    });
    ctx.audit.append({
      orgId: opts.orgId, actorType: "agent", actorId: "delivery-worker",
      action: "delivery.blocked", resourceType: "execution", resourceId: opts.executionId,
      riskLevel: "high", decision: "deny", result: "failure",
      metadata: { taskId: opts.taskId, reasons: gov.reasons, approvalId: apr.id },
    });
    return { executionId: opts.executionId, ok: false,
      blocked: `governance BLOCK: ${gov.reasons.join("; ")}` } as never;
  }

  if (gov.decision === "BLOCK") {
    ctx.db.updateById("executions", opts.executionId, {
      status: "failed", finished_at: ctx.db.now(),
      error_code: "GOVERNANCE_BLOCKED",
      output_summary: `blocked by governance: ${gov.reasons.join("; ")}`,
    });
    ctx.audit.append({
      orgId: opts.orgId, actorType: "agent", actorId: "delivery-worker",
      action: "delivery.blocked", resourceType: "execution", resourceId: opts.executionId,
      riskLevel: "high", decision: "deny", result: "failure",
      metadata: { taskId: opts.taskId, reasons: gov.reasons },
    });
    throw new AppError("DEPENDENCY_UNAVAILABLE", `governance BLOCK: ${gov.reasons.join("; ")}`);
  }

  // ================= PHASE 1 — spec enrichment / ADR / test strategy =====
  const vectorTotal = (Array.isArray(s.ops) ? (s.ops as { cases?: unknown[] }[]) : []).reduce(
    (n: number, o: { cases?: unknown[] }) => n + (Array.isArray(o.cases) ? o.cases.length : 1), 0);

  if (ctx.config.FEATURE_AGENT_SPECIALISTS && impactMode === "modify") {
    const { architectAdrDraft } = await import("./specialists.ts");
    architectAdrDraft(ctx, {
      orgId: opts.orgId, projectId: opts.projectId, taskId: opts.taskId, moduleName: s.moduleName,
    });
  }

  const knw = (kind: string, title: string, obj: Record<string, unknown>, tagsExtra: string[] = []) => {
    ctx.db.insert("knowledge_documents", {
      id: newId("knw"), org_id: opts.orgId, project_id: opts.projectId,
      kind, title,
      content: JSON.stringify(obj),
      tags: JSON.stringify([opts.taskId, "delivery", ...tagsExtra]),
      confidence: kind === "decision" ? 0.9 : 0.8,
      verification_status: "verified",
      created_by: "delivery-worker", created_at: ctx.db.now(), updated_at: ctx.db.now(),
    });
    ctx.bus.emit({ type: "Knowledge.created", orgId: opts.orgId, actorType: "system", actorId: "delivery-worker",
      payload: { executionId: opts.executionId, kind, title } });
    return title;
  };
  knw("fact", `EnrichedSpec ${s.moduleName}`, {
    ...(s as unknown as Record<string, unknown>), performanceBudget: "avg op < 5ms (20k iterations)",
    errorTaxonomy: ["assertion-mismatch → operator repair", "unparseable-failure → human triage"],
    securityReqs: ["no eval/dynamic-require", "no io/network imports", "secret-leak BLOCK"],
    complianceTags: ["audit-hash-chain", "receipt-on-completion"],
  }, ["enriched-spec"]);
  knw("decision", `ADR ${s.moduleName} (task ${opts.taskId})`, {
    context: `Autonomous delivery requested for module '${s.moduleName}' with ${opsCount} ops.`,
    decision: "Deterministic template synthesis with spec-driven vectors; isolated worktree; fail-closed gates.",
    alternatives: ["LLM generation (needs MODEL_PROVIDER_API_KEY)", "manual implementation"],
    consequences: "Reproducible offline builds; limited to binary arithmetic semantics until engine extended.",
  }, ["adr"]);
  knw("fact", `TestStrategy ${s.moduleName}`, {
    unitVectors: vectorTotal,
    propertyBased: "n/a (deterministic template)",
    contract: "exports == spec.ops with arity check",
    integration: "post-merge node --test on main",
    security: "staticScan + reviewer secret/path/debug gates",
    targets: { coverageLine: ">=80", mutation: "n/a deterministic" },
  }, ["test-strategy"]);

  ctx.db.updateById("executions", opts.executionId, {
    status: "running",
    started_at: ctx.db.now(),
  });

  const { runDeliveryPipeline } = await import("@agency/delivery");
  const { selectEngine, selectTransport, LlmCodegen } = await import("@agency/delivery");

  // PHASE A/F-04: route generated-code execution through configured sandbox.
  const transport = selectTransport(
    (ctx.config as unknown as { SANDBOX_PROVIDER?: string }).SANDBOX_PROVIDER ?? "process",
    process.env.AGENT_EXEC_CONTAINER_ID
  );

  // PHASE 1.1 + B3 engine selection:
  //   spec.codegen='llm' + provider → LlmCodegen (router-backed)
  //   else dual-mode via selectEngine (agentic requires key; deterministic default)
  const hasModelKey = Boolean(ctx.config.MODEL_PROVIDER_API_KEY);
  let codegen;
  if ((s as { codegen?: string }).codegen === "llm" && hasModelKey) {
    codegen = new LlmCodegen(async (messages, maxTokens) => {
      const completion = await ctx.router.complete(
        { messages, maxTokens },
        { tier: "STANDARD" } as never
      );
      return completion.content;
    });
  } else {
    codegen = selectEngine(s as { mode?: "deterministic" | "agentic" }, { hasModelKey });
  }

  // PHASE B2 advisory reviewer: only when flag AND real provider; failures skip.
  let advisory;
  if (ctx.config.FEATURE_LLM_REVIEWER && hasModelKey) {
    const { makeAdvisoryReviewer } = await import("@agency/delivery");
    advisory = makeAdvisoryReviewer({
      complete: async (prompt: string) => {
        const c = await ctx.router.complete(
          { messages: [{ role: "user", content: prompt }], maxTokens: 512 },
          { tier: "REVIEW" } as never
        );
        ctx.budget.recordSpend(0.001, {
          orgId: opts.orgId, projectId: opts.projectId, taskId: opts.taskId,
          reason: `advisory-review:${opts.executionId}`,
        });
        return c.content;
      },
      spec: s as never,
    });
  }

  const out = await runDeliveryPipeline({
    repoPath,
    taskId: opts.taskId,
    spec: spec as never,
    codegen,
    transport,
    advisory,
    injectFault: opts.injectFault,
    maxRepairAttempts: opts.maxRepairAttempts ?? 2,
    testsTimeoutMs: opts.testsTimeoutMs,
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
      ? out.converged
        ? `self-heal converged to main (no net diff) via ${out.mergedBranch}`
        : `delivered ${out.files.length} files via ${out.mergedBranch}`
      : `blocked: ${out.blocked}`,
    error_code: out.ok ? null : "DELIVERY_BLOCKED",
    sandbox_id: out.worktreePath ?? null,
  });

  if (out.ok) {
    // ---- PHASE 5.6: task state walk (full chain on clean builds; review-only for fault demos) ----
    const CHAIN = ["draft", "ready", "planned", "in_progress", "review", "qa", "security", "approval", "deploying", "deployed", "monitoring", "completed"] as const;
    const cur = ctx.db.get<{ status: string }>("SELECT status FROM tasks WHERE id = ?", [opts.taskId]);
    const idx = CHAIN.indexOf(String(cur?.status ?? "ready") as never);
    const target = opts.injectFault ? "review" : "completed";
    const endIdx = CHAIN.indexOf(target as never);
    for (let i = idx + 1; i <= endIdx; i++) {
      try { ctx.tasks.transition(opts.taskId, CHAIN[i] as never); } catch { break; }
    }

    // ---- PHASE 3.1: per-delivery SBOM-lite (content-addressable) ----
    const sbom = out.files.map((f) => ({ path: f.path, sha256: sha256Hex(f.content), bytes: f.content.length }));
    // ---- PHASE 5.4: retrospective ----
    const benchStage = out.stages.find((st) => st.stage === "benchmark_run");
    const retrospective =
      `wentWell: ${out.ok ? "gates green" : "blocked"}; ` +
      `repairAttempts: ${Math.max(0, out.attempts.length - 1)}; ` +
      `durationMs: ${Date.now() - startedAtMs}; ` +
      `benchAvgMs: ${JSON.stringify((benchStage?.detail.results as { op: string; avgMs: number }[] | undefined)?.map((r) => ({ op: r.op, avgMs: +r.avgMs.toFixed(4) })) ?? [])}; ` +
      `learning: deterministic template path needs no LLM cost`;

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
        repairAttempts: Math.max(0, out.attempts.length - 1),
        review: out.review?.verdict,
        sbom,
        evidenceHash: out.stages.find((st) => st.stage === "code_generated")?.detail.evidenceHash,
        durationMs: Date.now() - startedAtMs,
        retrospective,
      }),
      tags: JSON.stringify(["delivery", opts.executionId]),
      confidence: 1,
      verification_status: "verified",
      created_by: "delivery-worker",
      created_at: ctx.db.now(),
      updated_at: ctx.db.now(),
    });
    // SBOM as first-class searchable/archival artifact
    knw("fact", `SBOM ${s.moduleName} (${String(out.commitSha ?? "converged").slice(0, 8)})`, { components: sbom }, ["sbom"]);

    // PHASE 1.7 trajectory persistence (agentic mode)
    const traj = out.stages.find((st) => st.stage === "code_generated")?.detail.trajectory as
      | { mode?: string; toolCalls?: { tool: string; target: string; ok: boolean }[] }
      | undefined;
    if (traj?.toolCalls?.length) {
      knw("fact", `Trajectory ${s.moduleName} (${opts.executionId})`, traj, ["trajectory"]);
    }

    ctx.bus.emit({ type: "Promotion.staging_ready", orgId: opts.orgId, actorType: "system", actorId: "delivery-worker",
      payload: { executionId: opts.executionId, commit: out.commitSha, environment: "staging",
        note: "external promotion is operator-gated (feature-flagged)" } });

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

  // Optional completion webhook (HMAC-signed) — fires for succeeded AND blocked.
  if (ctx.config.WEBHOOK_OUTBOUND_URL && ctx.config.WEBHOOK_OUTBOUND_SECRET) {
    try {
      const { SignedWebhookEmitter } = await import("@agency/integrations");
      const emitter = new SignedWebhookEmitter({
        url: ctx.config.WEBHOOK_OUTBOUND_URL,
        secret: ctx.config.WEBHOOK_OUTBOUND_SECRET,
      });
      void emitter.emit(out.ok ? "delivery.completed" : "delivery.blocked", {
        executionId: opts.executionId,
        taskId: opts.taskId,
        projectId: opts.projectId,
        ok: out.ok,
        summary: out.ok
          ? out.converged ? "converged" : `delivered ${out.files.length} files`
          : String(out.blocked ?? ""),
        commit: out.commitSha ?? null,
      });
    } catch (e) {
      ctx.log.warn("delivery webhook emit failed", { error: String(e) });
    }
  }

  return { executionId: opts.executionId, traceId: "", ...out } as DeliveryRunResult;
}
