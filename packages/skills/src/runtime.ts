import type { Skill } from "./types.ts";

/**
 * Failure taxonomy for skill executions (master prompt §23). Each class maps to
 * an auditable, machine-readable reason — never a terse "error".
 */
export type SkillExecutionFailureClass =
  | "precondition_failed"
  | "tool_failed"
  | "verification_failed"
  | "timeout"
  | "budget_exceeded"
  | "permission_denied"
  | "dependency_blocked"
  | "instruction_failed";

/** Hooks decouple the runtime from any concrete executor (LLM, shell, sandbox). */
export interface SkillRuntimeHooks {
  /** Resolve each precondition string against the execution context. */
  evaluatePrecondition?(check: string, context: Record<string, unknown>): boolean;
  handlesTools?: { tools: string[]; granted: boolean }[];
  handlesPermissions?: { permissions: string[]; granted: boolean }[];
  /** Execute a single procedure step; returns step-local outputs. */
  runStep?(step: string, context: Record<string, unknown>, stepIndex: number): Promise<Record<string, unknown>>;
  /** Prove success against the skill's verification rubric. */
  verify?(output: Record<string, unknown>): Promise<{ ok: boolean; notes?: string }>;
  escalated?(failure: SkillExecutionFailureClass, target: string | undefined): void;
  budgetEstimateUsd?(output: Record<string, unknown>): number;
  budgetAllowanceUsd?(): number;
  /** Dependency gates (e.g. "migration applied") that must all resolve true. */
  dependencies?(): string[];
}

export interface SkillExecutionEvent {
  step: string;
  ok: boolean;
  ms: number;
  stepIndex: number;
}

export interface SkillExecutionResult {
  ok: boolean;
  skill: string;
  skillVersion: string;
  attempts: number;
  failureClass?: SkillExecutionFailureClass;
  failureMessage?: string;
  escalatedTo?: string;
  /** Keys aggregated across steps (instruction transcript + step outputs). */
  outputs: Record<string, unknown>;
  procedureStepsRun: number;
  durationMs: number;
  events: SkillExecutionEvent[];
  budgetUsd?: number;
}

export interface SkillExecutionOptions {
  input?: Record<string, unknown>;
  hooks?: SkillRuntimeHooks;
  timeoutMs?: number;
  onAttempt?: (attempt: number) => void;
}

export interface ParsedFailureHandling {
  kind: "retry" | "escalate" | "fail";
  maxAttempts: number;
  delayMs: number;
  target?: string;
}

const RETRY_RE = /^retry\(\s*maxAttempts=(\d+)(?:\s*,\s*delayMs=(\d+))?\s*\)$/i;
const ESCALATE_RE = /^escalat(?:e|ion)(?:\s*\(?target=([a-z0-9-]+)\)?)?$/i;

/** Deterministically parse the skill's `failureHandling` contract. */
export function parseFailureHandling(failureHandling: string): ParsedFailureHandling {
  const fh = failureHandling.trim();
  const retry = RETRY_RE.exec(fh);
  if (retry) {
    return {
      kind: "retry",
      maxAttempts: Math.max(1, Number(retry[1])),
      delayMs: retry[2] ? Math.max(0, Number(retry[2])) : 0,
    };
  }
  const esc = ESCALATE_RE.exec(fh);
  if (esc) return { kind: "escalate", maxAttempts: 1, delayMs: 0, target: esc[1] ?? "principal" };
  return { kind: "fail", maxAttempts: 1, delayMs: 0 };
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

/** Resolve `${path}` references and simple `<lhs> <op> <rhs>` comparisons. */
export function evaluateConditionExpression(
  expression: string,
  context: Record<string, unknown>
): boolean {
  const expr = expression.trim();
  if (!expr) return true;
  const tokenRe = /\$\{([\w.]+)\}/g;
  const unresolved = [];
  let substituted = String(expr);
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(expr)) !== null) {
    const value = getByPath(context, m[1]!);
    if (value === undefined) {
      unresolved.push(m[1]!);
      substituted = substituted.replace(m[0], "undefined");
    } else if (typeof value === "boolean") {
      substituted = substituted.replace(m[0], String(value));
    } else {
      substituted = substituted.replace(m[0], `"${String(value)}"`);
    }
  }
  if (unresolved.length > 0) return false;

  const cmp = /^([^=<>!]+)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/.exec(substituted);
  if (!cmp) return substituted === "true";
  const [, l = "", op = "==", r = ""] = cmp;
  const lv = l.trim().replace(/^"|"$/g, "");
  const rv = r.trim().replace(/^"|"$/g, "");
  const lNum = /^-?\d+(\.\d+)?$/.test(lv) ? Number(lv) : lv;
  const rNum = /^-?\d+(\.\d+)?$/.test(rv) ? Number(rv) : rv;
  switch (op) {
    case "==": case "=": return lNum === rNum;
    case "!=": return lNum !== rNum;
    case ">": return (lNum as number) > (rNum as number);
    case ">=": return (lNum as number) >= (rNum as number);
    case "<": return (lNum as number) < (rNum as number);
    case "<=": return (lNum as number) <= (rNum as number);
    default: return false;
  }
}

/** Reference rubric evaluator shared with the control-plane harness. */
export function evaluateRubric(rubric: string, output: Record<string, unknown>): boolean {
  const leaf = rubric.trim();
  if (!leaf) return true;
  // "prove X via ${claims.tests}"-style free text is reducible to its ${token} leaf.
  const tokens = [...leaf.matchAll(/\$\{([\w.]+)\}/g)].map((t) => t[1]!);
  if (tokens.length === 1) return Boolean(getByPath(output, tokens[0]!));
  if (tokens.length > 1) return tokens.every((t) => Boolean(getByPath(output, t)));
  const cmp = /^([\w.]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(leaf);
  if (cmp) return evaluateConditionExpression(`${cmp[1]} ${cmp[2]} ${cmp[3]}`, output);
  if (/always-true|trivially satisfied/i.test(leaf)) return true;
  return Boolean(getByPath(output, leaf));
}

const DEFAULT_HOOKS: Required<Pick<SkillRuntimeHooks, "runStep" | "budgetEstimateUsd" | "budgetAllowanceUsd" | "dependencies" | "evaluatePrecondition" | "escalated">> = {
  evaluatePrecondition: (check, context) => evaluateConditionExpression(check, context),
  runStep: async (step, _context, stepIndex) => ({ [`step_${stepIndex}`]: step }),
  budgetEstimateUsd: () => 0,
  budgetAllowanceUsd: () => Number.POSITIVE_INFINITY,
  dependencies: () => [],
  escalated: () => undefined,
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Deterministic skill execution runtime (master prompt §13 generic router; the
 * prompt's Phase 2 "skills are enforced at runtime, not just declared").
 *
 * The runtime owns the *orchestration* contract — eligibility, preconditions,
 * step sequencing, verification, budget, timeout and failure handling — and
 * delegates the *act of doing* to hooks. It is provider-agnostic and never
 * touches a database: the control plane wires hooks and persistence.
 */
export class SkillRuntime {
  async execute(skill: Skill, options: SkillExecutionOptions = {}): Promise<SkillExecutionResult> {
    const hooks: Required<SkillRuntimeHooks> = {
      ...DEFAULT_HOOKS,
      handlesTools: [],
      handlesPermissions: [],
      verify: (options.hooks?.verify ?? (async (output: Record<string, unknown>) => ({
        ok: evaluateRubric(skill.verification, output),
        notes: `rubric: ${skill.verification}`,
      }))),
    };
    const base = options.hooks ?? {};
    Object.assign(hooks, base);
    const started = Date.now();
    const context: Record<string, unknown> = { input: options.input ?? {} };
    const attempts = Math.max(1, parseFailureHandling(skill.failureHandling).maxAttempts);
    const events: SkillExecutionEvent[] = [];

    const fail = (
      failureClass: SkillExecutionFailureClass,
      message: string,
      opts: { escalate?: string } = {}
    ): SkillExecutionResult => {
      const res: SkillExecutionResult = {
        ok: false,
        skill: skill.name,
        skillVersion: skill.version,
        attempts,
        failureClass,
        failureMessage: message,
        escalatedTo: opts.escalate,
        outputs: context,
        procedureStepsRun: events.length,
        durationMs: Date.now() - started,
        events,
      };
      if (opts.escalate) hooks.escalated(failureClass, opts.escalate);
      return res;
    };

    const active = (entry: { tools?: string[]; permissions?: string[]; granted: boolean }) => entry.granted;
    for (const req of skill.requiredTools ?? []) {
      const handled = hooks.handlesTools?.find((h) => h.tools.includes(req));
      if (handled && !active(handled)) {
        return fail(
          "tool_failed",
          `required tool '${req}' is not granted to this execution`,
          { escalate: escalateFor(skill.failureHandling) }
        );
      }
    }
    for (const req of skill.requiredPermissions ?? []) {
      const handled = hooks.handlesPermissions?.find((h) => h.permissions.includes(req));
      if (handled && !active(handled)) {
        return fail(
          "permission_denied",
          `required permission '${req}' is not granted to this execution`,
          { escalate: escalateFor(skill.failureHandling) }
        );
      }
    }

    const budgetEstimate = hooks.budgetEstimateUsd(context);
    if (budgetEstimate > hooks.budgetAllowanceUsd()) {
      return fail(
        "budget_exceeded",
        `estimated cost $${budgetEstimate.toFixed(4)} exceeds allowance $${hooks.budgetAllowanceUsd().toFixed(4)}`,
        { escalate: escalateFor(skill.failureHandling) }
      );
    }

    const missing = hooks.dependencies().filter((d) => d.trim().length > 0 && !d.startsWith("ok:"));
    if (missing.length > 0) {
      return fail(
        "dependency_blocked",
        `unmet dependencies: ${missing.join(", ")}`,
        { escalate: escalateFor(skill.failureHandling) }
      );
    }

    for (const check of skill.preconditions ?? []) {
      if (!hooks.evaluatePrecondition(check, context)) {
        return fail(
          "precondition_failed",
          `precondition not satisfied: ${check}`,
          { escalate: escalateFor(skill.failureHandling) }
        );
      }
    }

    let lastFailure: { failureClass: SkillExecutionFailureClass; message: string } | null = null;
    let failureClass: SkillExecutionFailureClass | undefined;
    let failureMessage: string | undefined;
    // Procedure-phase failures are retryable when the contract says `retry(...)`;
    // gate failures (preconditions, tools, permissions, budget, deps) never retry.
    const allowFailureClass = (c: SkillExecutionFailureClass) =>
      c === "instruction_failed" || c === "timeout" || c === "verification_failed";

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        if (options.onAttempt) options.onAttempt(attempt);
        await sleep(parseFailureHandling(skill.failureHandling).delayMs);
      }
      events.length = 0;
      failureClass = undefined;
      failureMessage = undefined;
      try {
        const steps = skill.procedure ?? [];
        for (let i = 0; i < steps.length; i++) {
          const stepStart = Date.now();
          const stepContext: Record<string, unknown> = {
            ...context,
            stepIndex: i,
            input: options.input ?? {},
          };
          const stepOutput = await this.withStepTimeout(
            hooks.runStep(steps[i]!, stepContext, i),
            options.timeoutMs ?? 30_000
          );
          for (const [k, v] of Object.entries(stepOutput ?? {})) context[k] = v;
          events.push({ step: steps[i]!, ok: true, ms: Date.now() - stepStart, stepIndex: i });
        }
        const { ok, notes } = await this.withStepTimeout(
          hooks.verify(context),
          options.timeoutMs ?? 30_000
        );
        if (!ok) {
          failureClass = "verification_failed";
          failureMessage = notes ?? `verification rubric not satisfied: ${skill.verification}`;
          if (!allowFailureClass(failureClass) || attempt === attempts) {
            lastFailure = { failureClass, message: failureMessage };
            break;
          }
          lastFailure = { failureClass, message: failureMessage };
          continue;
        }
        return {
          ok: true,
          skill: skill.name,
          skillVersion: skill.version,
          attempts,
          outputs: context,
          procedureStepsRun: events.length,
          durationMs: Date.now() - started,
          events,
          budgetUsd: hooks.budgetEstimateUsd(context),
        };
      } catch (e) {
        const err = e as Error & { code?: string };
        const cls: SkillExecutionFailureClass =
          err.code === "TIMEOUT" ? "timeout" : "instruction_failed";
        failureClass = cls;
        failureMessage =
          cls === "timeout"
            ? `procedure exceeded ${options.timeoutMs ?? 30_000}ms`
            : `instruction raised: ${e instanceof Error ? e.message : String(e)}`;
        if (!allowFailureClass(cls) || attempt === attempts) {
          lastFailure = { failureClass: cls, message: failureMessage };
          break;
        }
        lastFailure = { failureClass: cls, message: failureMessage };
      }
    }

    if (lastFailure) {
      const target = escalationTargetFor(skill.failureHandling);
      return fail(lastFailure.failureClass, lastFailure.message, { escalate: target });
    }
    return fail("verification_failed", "no verified output produced");
  }

  private withStepTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        const err = new Error("step timed out") as Error & { code?: string };
        err.code = "TIMEOUT";
        reject(err);
      }, ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }
}

function escalateFor(failureHandling: string): string | undefined {
  const h = parseFailureHandling(failureHandling);
  return h.kind === "escalate" ? h.target : undefined;
}

function escalationTargetFor(failureHandling: string): string | undefined {
  return parseFailureHandling(failureHandling).target;
}