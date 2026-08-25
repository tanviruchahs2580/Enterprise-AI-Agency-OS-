import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { GitWorktreeService } from "@agency/orchestration";
import type {
  CodegenEngine,
  DeliverySpec,
  FileArtifact,
} from "./types.ts";
import type { ReviewResult } from "./reviewer.ts";
import { reviewDiff } from "./reviewer.ts";
import { parseFailure } from "./diagnose.ts";
import { runTests, writeFiles } from "./runner.ts";

export interface DeliveryPipelineOptions {
  /** Existing clean git repository (main workspace). */
  repoPath: string;
  taskId: string;
  spec: DeliverySpec;
  codegen: CodegenEngine;
  /** Simulate a buggy first attempt to exercise the self-healing loop. */
  injectFault?: boolean;
  maxRepairAttempts?: number;
  /** Progress/observability callback. */
  onStage?: (stage: string, detail: Record<string, unknown>) => void;
}

export type DeliveryStage =
  | "worktree_created"
  | "code_generated"
  | "fault_injected"
  | "tests_run"
  | "repair_attempted"
  | "review_completed"
  | "committed"
  | "merged"
  | "blocked"
  | "failed";

export interface DeliveryOutcome {
  ok: boolean;
  blocked?: string;
  stages: { stage: DeliveryStage; at: string; detail: Record<string, unknown> }[];
  attempts: { n: number; passed: boolean; failedTests: number; diagnosis?: string }[];
  review?: ReviewResult;
  files: FileArtifact[];
  commitSha?: string;
  mergedBranch?: string;
  worktreePath?: string;
}

/**
 * Closed autonomous delivery pipeline (Phases 3–9):
 * worktree → generate → write → test → [diagnose→repair→retest]* →
 * review → commit → merge (ff) → cleanup.
 */
export async function runDeliveryPipeline(
  opts: DeliveryPipelineOptions
): Promise<DeliveryOutcome> {
  const stages: DeliveryOutcome["stages"] = [];
  const attempts: DeliveryOutcome["attempts"] = [];
  const record = (stage: DeliveryStage, detail: Record<string, unknown> = {}) => {
    stages.push({ stage, at: new Date().toISOString(), detail });
    opts.onStage?.(stage, detail);
  };

  let worktreePath: string | undefined;

  try {
    // ---- Phase 3: isolated worktree (never touch main directly) ----
    const svc = new GitWorktreeService();
    const wt = svc.create(opts.repoPath, opts.taskId);
    worktreePath = wt.path;
    record("worktree_created", { path: wt.path, branch: wt.branch });

    // ---- Phase 4: code generation ----
    const gen = await opts.codegen.generate(opts.spec);
    let files = gen.files;
    record("code_generated", {
      strategy: gen.strategy,
      files: files.map((f) => f.path),
      tokensIn: gen.tokensIn,
      costUsd: gen.costUsd,
    });

    if (opts.injectFault) {
      // simulate buggy agent output: break the FIRST op's operator
      const moduleFile = files.find((f) => f.path.startsWith("src/"))!;
      moduleFile.content = moduleFile.content.replace(
        /return a (\S+) b;/,
        (_m, op) => `return a ${op === "+" ? "-" : "+"} b;`
      );
      record("fault_injected", { file: moduleFile.path });
    }

    writeFiles(wt.path, files);

    // ---- Phase 5–6: test → diagnose → repair loop ----
    const maxRepairs = opts.maxRepairAttempts ?? 2;
    for (let attempt = 1; attempt <= 1 + maxRepairs; attempt++) {
      const res = await runTests(wt.path);
      const passed = res.exitCode === 0 && res.failed === 0;
      attempts.push({
        n: attempt,
        passed,
        failedTests: res.failed,
      });
      record("tests_run", { attempt, exitCode: res.exitCode, passed: res.passed, failed: res.failed });

      if (passed) break;
      if (attempt > maxRepairs) {
        record("blocked", { reason: "repair budget exhausted" });
        return {
          ok: false,
          blocked: "repair budget exhausted",
          stages, attempts, files, worktreePath: wt.path,
        };
      }

      // structured failure parsing (shared diagnose module)
      const info = parseFailure(res.output);
      const fileHint = /(?:src|test)\/[\w.-]+\.js/.exec(res.output)?.[0];
      if (!info || info.expected === undefined || info.actual === undefined) {
        record("blocked", { reason: "unparseable failure — needs human triage" });
        return {
          ok: false, blocked: "unparseable failure", stages, attempts, files, worktreePath: wt.path,
        };
      }
      const expected = info.expected;
      // info.actual is recorded; repair uses expected + operand hints
      const repaired = await opts.codegen.repair(
        opts.spec,
        files,
        {
          testOutput: res.output.slice(-2000),
          failingTest: info.failingTest,
          expected,
          actual: info.actual,
          file: fileHint?.startsWith("src/") ? fileHint : `src/${opts.spec.moduleName}.js`,
          operandHintA: info.operandHintA,
          operandHintB: info.operandHintB,
        }
      );
      if (!repaired.changed) {
        record("blocked", { reason: repaired.diagnosis });
        return { ok: false, blocked: repaired.diagnosis, stages, attempts, files, worktreePath: wt.path };
      }
      files = repaired.files;
      writeFiles(wt.path, files);
      attempts[attempts.length - 1]!.diagnosis = repaired.diagnosis;
      record("repair_attempted", { attempt, diagnosis: repaired.diagnosis });
    }

    // ---- Phase 7: automated review gate ----
    const finalDiffFiles = collectFinalFiles(wt.path, files);
    const review = reviewDiff(finalDiffFiles);
    record("review_completed", { verdict: review.verdict, findings: review.findings.length });
    if (review.verdict !== "APPROVE") {
      return {
        ok: false, blocked: `review ${review.verdict}`, review, stages, attempts,
        files: finalDiffFiles, worktreePath: wt.path,
      };
    }

    // ---- Phase 9: commit + merge (fast-forward policy) ----
    const commitSha = svc.commitAll(
      wt.path,
      `feat(${opts.spec.moduleName}): autonomous delivery for task ${opts.taskId}`
    );
    record("committed", { sha: commitSha });
    execGit(opts.repoPath, ["merge", "--ff-only", wt.branch]);
    record("merged", { branch: wt.branch });

    svc.remove(opts.repoPath, wt);
    worktreePath = undefined;

    return {
      ok: true,
      stages, attempts, review,
      files: finalDiffFiles,
      commitSha,
      mergedBranch: wt.branch,
    };
  } catch (e) {
    record("failed", { error: String((e as Error).message ?? e) });
    return { ok: false, blocked: String((e as Error).message ?? e), stages, attempts, files: [], worktreePath };
  } finally {
    if (worktreePath && existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

function collectFinalFiles(worktreePath: string, known: FileArtifact[]): FileArtifact[] {
  const out: FileArtifact[] = [];
  for (const k of known) {
    const abs = join(worktreePath, k.path);
    if (existsSync(abs)) out.push({ path: k.path, content: readFileSync(abs, "utf8") });
  }
  return out;
}
function execGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
