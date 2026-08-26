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
import { staticScan, contractCheck, runBenchmark } from "./gates.ts";

export interface DeliveryPipelineOptions {
  /** Existing clean git repository (main workspace). */
  repoPath: string;
  taskId: string;
  spec: DeliverySpec;
  codegen: CodegenEngine;
  /** Simulate a buggy first attempt to exercise the self-healing loop. */
  injectFault?: boolean;
  maxRepairAttempts?: number;
  /** Per-attempt test-run timeout in ms (default 120000). */
  testsTimeoutMs?: number;
  /** Progress/observability callback. */
  onStage?: (stage: string, detail: Record<string, unknown>) => void;
}

export type DeliveryStage =
  | "worktree_created"
  | "code_generated"
  | "static_analysis"
  | "fault_injected"
  | "tests_run"
  | "repair_attempted"
  | "contract_verified"
  | "benchmark_run"
  | "docs_generated"
  | "review_completed"
  | "committed"
  | "merged"
  | "converged"
  | "postmerge_verified"
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
  /** True when self-heal repaired the code back to the state already on main
   *  (no net diff) — delivery counts as succeeded without a new commit. */
  converged?: boolean;
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
      evidenceHash: gen.evidenceHash,
    });

    // ---- static analysis & security gate (fail-closed, pre-test) ----
    const staticFindings = staticScan(files);
    record("static_analysis", { findings: staticFindings.length });
    if (staticFindings.length > 0) {
      record("blocked", { reason: "static analysis", findings: staticFindings });
      return {
        ok: false,
        blocked: `static analysis: ${staticFindings[0]!.message} (${staticFindings[0]!.path})`,
        stages, attempts, files, worktreePath: wt.path,
      };
    }

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
      const res = await runTests(wt.path, opts.testsTimeoutMs);
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

    // ---- contract gate: exported surface must equal spec.ops ----
    const contract = contractCheck(opts.spec, files);
    record("contract_verified", { ok: contract.ok, problems: contract.problems });
    if (!contract.ok) {
      record("blocked", { reason: "contract mismatch" });
      return {
        ok: false, blocked: `contract mismatch: ${contract.problems[0]}`,
        stages, attempts, files, worktreePath: wt.path,
      };
    }

    // ---- performance micro-benchmark (out-of-process) ----
    const bench = await runBenchmark(wt.path, opts.spec);
    record("benchmark_run", { pass: bench.pass, results: bench.results });
    if (!bench.pass) {
      record("blocked", { reason: "benchmark budget exceeded" });
      return {
        ok: false, blocked: "benchmark budget exceeded",
        stages, attempts, files, worktreePath: wt.path,
      };
    }

    // ---- docs artifact confirmation (README generated at codegen) ----
    const readme = files.find((f) => f.path === "README.md");
    record("docs_generated", { readmeIncluded: Boolean(readme), bytes: readme?.content.length ?? 0 });

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
    // Self-heal convergence: if the repaired tree is semantically identical
    // to main (e.g. fault injected on a re-delivery of an already-correct
    // module), there is nothing to commit — count as succeeded without a new
    // commit. Detection uses the staged diff (git normalizes EOL), NOT raw
    // status, so checkout line-ending churn cannot fake a dirty tree.
    execGit(wt.path, ["add", "-A"]);
    const staged = execGit(wt.path, ["diff", "--cached", "--name-only"]).trim();
    if (staged === "") {
      svc.remove(opts.repoPath, wt);
      worktreePath = undefined;
      record("converged", { branch: wt.branch, detail: "repaired output matches main; no net diff" });
      // post-merge verification still runs against main (Phase 4.3)
      const pm = await runTests(opts.repoPath, opts.testsTimeoutMs);
      record("postmerge_verified", { passed: pm.passed, failed: pm.failed, target: "main" });
      if (pm.failed > 0) {
        return { ok: false, blocked: "post-merge verification failed on main", stages, attempts, review, files, mergedBranch: wt.branch, converged: true };
      }
      return {
        ok: true,
        stages, attempts, review,
        files, mergedBranch: wt.branch, converged: true,
      };
    }
    const commitSha = svc.commitAll(
      wt.path,
      `feat(${opts.spec.moduleName}): autonomous delivery for task ${opts.taskId}`
    );
    record("committed", { sha: commitSha });
    execGit(opts.repoPath, ["merge", "--ff-only", wt.branch]);
    record("merged", { branch: wt.branch });

    // ---- Phase 4.3: post-merge verification on merged main ----
    const pmMain = await runTests(opts.repoPath, opts.testsTimeoutMs);
    record("postmerge_verified", { passed: pmMain.passed, failed: pmMain.failed, target: "main" });

    svc.remove(opts.repoPath, wt);
    worktreePath = undefined;

    if (pmMain.failed > 0) {
      return {
        ok: false, blocked: `post-merge verification failed (${pmMain.failed} failing)`,
        stages, attempts, review, files: finalDiffFiles, commitSha, mergedBranch: wt.branch,
      };
    }

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
    // Deregister any worktree whose directory was removed on failure/blocked
    // paths — otherwise `git worktree list` keeps stale "prunable" entries.
    if (opts.repoPath) {
      try { execGit(opts.repoPath, ["worktree", "prune"]); } catch { /* best effort */ }
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
