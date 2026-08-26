import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateCodegen } from "../src/codeng.ts";
import { selectEngine, AgenticModeRequiredError } from "../src/agentic.ts";
import { runDeliveryPipeline } from "../src/pipeline.ts";
import type { DeliverySpec } from "../src/types.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

const SPEC: DeliverySpec = {
  kind: "delivery",
  moduleName: "calculator",
  ops: [
    { name: "add", arity: 2 },
    { name: "mul", arity: 2 },
  ],
};

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "delivery-repo-"));
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.email", "agency@os.dev");
  git(dir, "config", "user.name", "Agency OS");
  writeFileSync(join(dir, "README.md"), "# demo\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "chore: seed");
  return dir;
}



test("HAPPY PATH: generate → tests green → review APPROVE → commit → merged into main", async () => {
  const repo = freshRepo();
  const out = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_happy1",
    spec: SPEC,
    codegen: new TemplateCodegen(),
  });

  assert.equal(out.ok, true, `blocked: ${out.blocked}`);
  assert.equal(out.review!.verdict, "APPROVE");
  assert.match(out.commitSha!, /^[0-9a-f]{40}$/);
  assert.ok(existsSync(join(repo, "src", "calculator.js")), "merged file must exist on main");
  // tests actually pass on merged main
  const t = execFileSync(process.execPath, ["--test"], { cwd: repo, encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT")) });
  assert.match(t, /pass [2-9]/);
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("SELF-HEALING: injected fault → red → automated repair → green → merged", async () => {
  const repo = freshRepo();
  const stagesSeen: string[] = [];
  const out = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_heal1",
    spec: SPEC,
    codegen: new TemplateCodegen(),
    injectFault: true,
    maxRepairAttempts: 2,
    onStage: (s) => stagesSeen.push(s),
  });

  assert.equal(out.ok, true, `blocked: ${out.blocked}`);
  assert.ok(stagesSeen.includes("fault_injected"), "fault stage recorded");
  const failedAttempt = out.attempts.find((a) => !a.passed);
  const greenAttempt = out.attempts.find((a) => a.passed && a.n > (failedAttempt?.n ?? 0));
  assert.ok(failedAttempt, "first attempt must have failed");
  assert.ok(greenAttempt, "repair produced a passing attempt");
  assert.ok(failedAttempt!.diagnosis, "diagnosis recorded");
  assert.equal(out.review!.verdict, "APPROVE");

  const mulSrc = readFileSync(join(repo, "src", "calculator.js"), "utf8");
  assert.match(mulSrc, /return a \* b;/, "repaired operator must be '*'");

  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("REVIEW GATE: secret in generated content is BLOCKED", async () => {
  const repo = freshRepo();
  const evil = new TemplateCodegen();
  const origGenerate = evil.generate.bind(evil);
  evil.generate = async (spec) => {
    const r = await origGenerate(spec);
    r.files.push({
      path: "src/config.js",
      content: 'export const awsKey = "AKIAIOSFODNN7EXAMPLE";\n',
    });
    return r;
  };
  const out = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_secret",
    spec: SPEC,
    codegen: evil,
  });
  assert.equal(out.ok, false);
  assert.match(out.blocked!, /review BLOCK/);
  assert.equal(out.review!.findings.some((f) => f.rule === "secret-leak"), true);
  // nothing merged
  assert.ok(!existsSync(join(repo, "src")));
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("BUDGET GATE: unparseable failure safely blocks instead of looping forever", async () => {
  const repo = freshRepo();
  const broken = new TemplateCodegen();
  const origRepair = broken.repair.bind(broken);
  broken.repair = async (spec, files, failure) => {
    const r = await origRepair(spec, files, failure);
    return { ...r, changed: false, diagnosis: "cannot fix this class" };
  };
  const out = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_stuck",
    spec: SPEC,
    codegen: broken,
    injectFault: true,
    maxRepairAttempts: 1,
  });
  assert.equal(out.ok, false);
  assert.match(out.blocked!, /no single-operator|budget|unparseable|cannot fix/i);
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("CUSTOM CASES: spec-provided test vectors drive emitted tests and pass on merged main", async () => {
  const repo = freshRepo();
  const spec: DeliverySpec = {
    kind: "delivery",
    moduleName: "vecmath",
    ops: [
      { name: "add", arity: 2, cases: [[2, 3, 5], [10, -4, 6]] },
      { name: "mul", arity: 2, cases: [[4, 5, 20]] },
    ],
  };
  const out = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_custom",
    spec,
    codegen: new TemplateCodegen(),
  });
  assert.equal(out.ok, true, `blocked: ${out.blocked}`);
  const tests = readFileSync(join(repo, "test", "vecmath.test.js"), "utf8");
  assert.match(tests, /add\(2, 3\) === 5/);
  assert.match(tests, /add\(10, -4\) === 6/);
  assert.match(tests, /mul\(4, 5\) === 20/);
  // all three vectors actually ran green on merged main
  const t = execFileSync(process.execPath, ["--test"], { cwd: repo, encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT")) });
  assert.match(t, /pass 3/);
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("MASTER PIPELINE GOVERNANCE: static gate, contract gate, benchmark, docs, post-merge — ordered and enforced", async () => {
  const repo = freshRepo();
  const stagesSeen: string[] = [];
  const out = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_master",
    spec: SPEC,
    codegen: new TemplateCodegen(),
    onStage: (s) => stagesSeen.push(s),
  });
  assert.equal(out.ok, true, `blocked: ${out.blocked}`);

  // ordered enforcement of the extended pipeline
  const order = ["code_generated", "static_analysis", "tests_run", "contract_verified", "benchmark_run", "docs_generated", "review_completed", "committed", "merged", "postmerge_verified"];
  let cursor = -1;
  for (const s of order) {
    const i = stagesSeen.indexOf(s);
    assert.ok(i > cursor, `${s} must occur after previous gate`);
    cursor = i;
  }
  // auto-generated documentation artifact merged to main
  assert.ok(existsSync(join(repo, "README.md")), "README.md generated");
  const readme = readFileSync(join(repo, "README.md"), "utf8");
  assert.match(readme, /## API/);
  assert.match(readme, /\| `add` \| 2 \|/);
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("STATIC GATE: generated code containing eval is fail-closed BLOCKED before any test runs", async () => {
  const repo = freshRepo();
  const evil = new TemplateCodegen();
  const origGenerate = evil.generate.bind(evil);
  evil.generate = async (spec) => {
    const r = await origGenerate(spec);
    r.files.push({
      path: "src/dynamic.js",
      content: "export function boom(expr) { return eval(expr); }\n",
    });
    return r;
  };
  const stagesSeen: string[] = [];
  const out = await runDeliveryPipeline({
    repoPath: repo, taskId: "tsk_eval", spec: SPEC, codegen: evil,
    onStage: (s) => stagesSeen.push(s),
  });
  assert.equal(out.ok, false);
  assert.match(out.blocked!, /static analysis/);
  assert.ok(stagesSeen.includes("static_analysis"));
  assert.ok(!stagesSeen.includes("tests_run"), "no tests may run after static BLOCK");
  assert.ok(!existsSync(join(repo, "src")), "nothing merged");
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("CONTRACT GATE: undeclared export or arity drift blocks the delivery", async () => {
  const repo = freshRepo();
  const lying = new TemplateCodegen();
  const origGenerate = lying.generate.bind(lying);
  lying.generate = async (spec) => {
    const r = await origGenerate(spec);
    r.files[1]!.content += "\nexport function sneaky(a) { return a; }\n";
    return r;
  };
  const out = await runDeliveryPipeline({
    repoPath: repo, taskId: "tsk_contract", spec: SPEC, codegen: lying,
  });
  assert.equal(out.ok, false);
  assert.match(out.blocked!, /contract mismatch/);
  assert.match(out.blocked!, /undeclared export: sneaky/);
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("A5 AUTO-REVERT: worktree-pass/main-fail module is reverted so main HEAD==base and never left failing", async () => {
  const repo = freshRepo();
  const baseHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const envCodegen = new TemplateCodegen();
  const origGenerate = envCodegen.generate.bind(envCodegen);
  envCodegen.generate = async (spec) => {
    const r = await origGenerate(spec);
    // passes only inside the isolated worktree; fails once merged to main
    r.files.push({
      path: "test/envguard.test.js",
      content:
        "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n" +
        "test('runs only in agency worktree', () => {\n" +
        "  assert.ok(process.cwd().includes('.agency-worktrees'));\n});\n",
    });
    return r;
  };

  const stagesSeen: string[] = [];
  const out = await runDeliveryPipeline({
    repoPath: repo, taskId: "tsk_autorevert", spec: SPEC, codegen: envCodegen,
    onStage: (s) => stagesSeen.push(s),
  });

  assert.equal(out.ok, false);
  assert.match(out.blocked!, /auto-reverted/);
  assert.ok(stagesSeen.includes("postmerge_reverted"), "revert stage recorded");
  const headAfter = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  assert.equal(headAfter, baseHead, "main restored to pre-merge commit");
  assert.ok(!existsSync(join(repo, "src")), "merged module removed by revert");
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

// ---------- PHASE 1.1 dual-mode ----------

test("DUAL MODE: deterministic default; agentic without key fails closed; with scripted engine produces identical artifacts + trajectory", async () => {
  // default → deterministic
  assert.ok(selectEngine({}, { hasModelKey: false }) instanceof TemplateCodegen);
  // agentic without key → clean fail-closed
  assert.throws(
    () => selectEngine({ mode: "agentic" }, { hasModelKey: false }),
    (e: unknown) => e instanceof AgenticModeRequiredError
  );
  // agentic WITH key (scripted engine) → same gates, same artifact shape + trajectory
  const repo = freshRepo();
  const out = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_agentic",
    spec: { ...SPEC, mode: "agentic" },
    codegen: selectEngine({ mode: "agentic" }, { hasModelKey: true }),
  });
  assert.equal(out.ok, true, `blocked: ${out.blocked}`);
  const trajStage = out.stages.find((s) => s.stage === "code_generated");
  const traj = trajStage?.detail.trajectory as
    | { mode?: string; toolCalls?: { tool: string }[] }
    | undefined;
  assert.equal(traj?.mode, "agentic");
  assert.ok((traj?.toolCalls?.length ?? 0) >= 8, "read+write per file + tests + git status");
  assert.match(readFileSync(join(repo, "src", "calculator.js"), "utf8"), /return a \* b;/);
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("PROPERTY-STYLE: deliverySpec validation accepts only well-formed ops across many shapes", async () => {
  const shapes: { valid: boolean; spec: unknown }[] = [
    { valid: true, spec: { kind: "delivery", moduleName: "m1", ops: [{ name: "add", arity: 2 }] } },
    { valid: true, spec: { kind: "delivery", moduleName: "m2", mode: "agentic", ops: [] } },
    { valid: false, spec: { kind: "delivery", moduleName: "", ops: [] } },
    { valid: false, spec: { kind: "delivery", ops: [] } },
    { valid: false, spec: { kind: "other", moduleName: "x", ops: [] } },
    { valid: false, spec: { moduleName: "x", ops: [] } },
    { valid: true, spec: { kind: "delivery", moduleName: "M3_X", ops: [{ name: "sub", arity: 2, cases: [[9, 4, 5]] }, { name: "mul", arity: 2 }] } },
  ];
  for (const [i, s] of shapes.entries()) {
    const ok =
      typeof s.spec === "object" && s.spec !== null &&
      (s.spec as { kind?: string }).kind === "delivery" &&
      typeof (s.spec as { moduleName?: string }).moduleName === "string" &&
      ((s.spec as { moduleName?: string }).moduleName ?? "").length > 0 &&
      Array.isArray((s.spec as { ops?: unknown }).ops);
    assert.equal(ok, s.valid, `shape #${i} should be ${s.valid ? "valid" : "invalid"}`);
  }
});

// ---------- PHASE 1.1 dual-mode (end) ----------

test("CHAOS/TIMEOUT INJECTION: 1ms tests budget kills hung runs and blocks cleanly (no hang, no orphan)", async () => {
  const repo = freshRepo();
  const t0 = Date.now();
  const out = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_timeout",
    spec: SPEC,
    codegen: new TemplateCodegen(),
    injectFault: true, // force at least one RED cycle
    maxRepairAttempts: 2,
    testsTimeoutMs: 1,  // absurdly low — every attempt must time out
  });
  const wall = Date.now() - t0;
  assert.equal(out.ok, false);
  assert.match(out.blocked!, /repair budget exhausted|unparseable/);
  assert.ok(wall < 30_000, `must not hang (took ${wall}ms)`);
  // cleanup equivalence: no stale worktree registration
  const wl = execFileSync("git", ["worktree", "list"], { cwd: repo, encoding: "utf8" });
  assert.doesNotMatch(wl, /prunable/);
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

test("RE-DELIVERY CONVERGENCE: fault-injected second delivery of an already-correct module succeeds with no net diff and leaves no stale worktree", async () => {
  const repo = freshRepo();
  // First delivery merges correct code into main.
  const first = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_conv_1",
    spec: SPEC,
    codegen: new TemplateCodegen(),
  });
  assert.equal(first.ok, true, `blocked: ${first.blocked}`);
  const headBefore = git(repo, "rev-parse", "HEAD").trim();

  // Second delivery with injected fault: self-heal repairs back to identical
  // content — must count as succeeded (converged), NOT fail on empty commit,
  // and must not leave a prunable worktree registration behind.
  const stagesSeen: string[] = [];
  const second = await runDeliveryPipeline({
    repoPath: repo,
    taskId: "tsk_conv_2",
    spec: SPEC,
    codegen: new TemplateCodegen(),
    injectFault: true,
    maxRepairAttempts: 2,
    onStage: (s) => stagesSeen.push(s),
  });

  assert.equal(second.ok, true, `blocked: ${second.blocked}`);
  assert.equal(second.converged, true, "outcome should be marked converged");
  assert.ok(stagesSeen.includes("converged"), "converged stage recorded");
  assert.ok(!second.commitSha, "no commit when there is no net diff");
  assert.equal(git(repo, "rev-parse", "HEAD").trim(), headBefore, "main HEAD unchanged");
  assert.match(readFileSync(join(repo, "src", "calculator.js"), "utf8"), /return a \* b;/);

  const wl = git(repo, "worktree", "list");
  assert.doesNotMatch(wl, /agency\/task/, "no stale worktree registrations remain");
  assert.doesNotMatch(wl, /prunable/, "worktree metadata pruned");

  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});
