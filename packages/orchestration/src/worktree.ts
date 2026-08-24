import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Git worktree isolation for the agent delivery loop (GAP G-09):
 *   task → branch + worktree → agent edits → diff → merge → cleanup.
 *
 * Safety properties:
 * - refuses to operate when the MAIN workspace has uncommitted changes
 *   (dirty-tree protection) so agent work can never be mixed with human WIP
 * - all git invocations are argument-array based (no shell interpolation)
 * - branches are namespaced under agency/task-<taskId>
 */

export interface WorktreeHandle {
  path: string;
  branch: string;
  baseCommit: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

export class GitWorktreeService {
  assertClean(repoPath: string): void {
    const status = git(repoPath, ["status", "--porcelain"]);
    if (status.trim() !== "") {
      throw new Error(
        `refusing worktree operation: repository is dirty (uncommitted changes). Commit or stash first.`
      );
    }
  }

  create(repoPath: string, taskId: string): WorktreeHandle {
    this.assertClean(repoPath);
    const branch = `agency/task-${taskId}`;
    const wtDir = join(repoPath, ".agency-worktrees", taskId.replace(/[^a-zA-Z0-9_-]/g, ""));
    mkdirSync(join(repoPath, ".agency-worktrees"), { recursive: true });
    const baseCommit = git(repoPath, ["rev-parse", "HEAD"]).trim();
    // add worktree with a new branch rooted at current HEAD
    execFileSync("git", ["worktree", "add", "-b", branch, wtDir, "HEAD"], { cwd: repoPath });
    return { path: wtDir, branch, baseCommit };
  }

  /** Unified diff of all changes vs base commit (agent output), incl. new files. */
  diff(worktreePath: string): string {
    // Mark untracked files as intent-to-add so plain diff includes them.
    try {
      execFileSync("git", ["add", "-N", "."], { cwd: worktreePath });
    } catch {
      /* nothing to mark */
    }
    return execFileSync("git", ["diff", "HEAD", "--"], { cwd: worktreePath, encoding: "utf8" }).trimEnd();
  }

  commitAll(worktreePath: string, message: string): string {
    execFileSync("git", ["add", "-A"], { cwd: worktreePath });
    execFileSync("git", ["commit", "-m", message], { cwd: worktreePath });
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: worktreePath, encoding: "utf8" }).trim();
  }

  remove(repoPath: string, handle: WorktreeHandle): void {
    if (existsSync(handle.path)) {
      rmSync(handle.path, { recursive: true, force: true, maxRetries: 3 });
    }
    try {
      execFileSync("git", ["worktree", "prune"], { cwd: repoPath });
      execFileSync("git", ["branch", "-D", handle.branch], { cwd: repoPath });
    } catch {
      /* branch may already be merged/removed */
    }
  }
}

/** Functional shortcuts used by the delivery loop. */
export function createWorktreeForTask(repoPath: string, taskId: string): WorktreeHandle {
  return new GitWorktreeService().create(repoPath, taskId);
}

export function collectDiff(worktreePath: string): string {
  return new GitWorktreeService().diff(worktreePath);
}

export function removeWorktree(repoPath: string, handle: WorktreeHandle): void {
  new GitWorktreeService().remove(repoPath, handle);
}
