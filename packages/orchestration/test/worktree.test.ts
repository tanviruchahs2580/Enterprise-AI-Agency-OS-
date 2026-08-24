import { test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  GitWorktreeService,
  createWorktreeForTask,
  collectDiff,
  removeWorktree,
} from "../src/worktree.ts";

let repoDir: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

beforeEach(() => {
  repoDir = mkdtempSync(join(tmpdir(), "agencyos-repo-"));
  git(repoDir, "init", "-b", "main");
  git(repoDir, "config", "user.email", "test@agencyos.dev");
  git(repoDir, "config", "user.name", "Test");
  writeFileSync(join(repoDir, "README.md"), "# demo\n");
  git(repoDir, "add", "-A");
  git(repoDir, "commit", "-m", "chore: seed");
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true, maxRetries: 3 });
});

test("G-09: worktree isolation — create, modify, diff, cleanup", () => {
  const svc = new GitWorktreeService();
  const taskId = "tsk_demo123";

  const wt = svc.create(repoDir, taskId);
  assert.ok(existsSync(wt.path));
  assert.match(wt.branch, /agency\/task-tsk_demo123/);

  // agent modifies code INSIDE the worktree only
  writeFileSync(join(wt.path, "feature.ts"), "export const x = 1;\n");

  const diff = svc.diff(wt.path);
  assert.match(diff, /feature\.ts/);

  // main workspace untouched
  assert.ok(!existsSync(join(repoDir, "feature.ts")));

  // commit inside the worktree, merge back into main, cleanup
  const sha = svc.commitAll(wt.path, "feat: add feature module");
  assert.match(sha, /^[0-9a-f]{40}$/);
  git(repoDir, "merge", "--ff-only", wt.branch);
  assert.ok(existsSync(join(repoDir, "feature.ts")));

  svc.remove(repoDir, wt);
  assert.ok(!existsSync(wt.path));
});

test("G-09: dirty main tree is protected — worktree creation refused", () => {
  writeFileSync(join(repoDir, "README.md"), "# modified uncommitted\n");
  assert.throws(
    () => createWorktreeForTask(repoDir, "tsk_x"),
    /dirty|uncommitted/i
  );
});

test("G-09: diff helper returns empty for clean worktree", () => {
  const wt = createWorktreeForTask(repoDir, "tsk_clean");
  const diff = collectDiff(wt.path);
  assert.equal(diff.trim(), "");
  removeWorktree(repoDir, wt);
});
