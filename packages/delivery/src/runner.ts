import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Env without test-runner inheritance — nested node --test must actually run. */
export function cleanTestEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT"));
}
import type { FileArtifact } from "./types.ts";

export interface TestRunResult {
  command: string;
  exitCode: number | null;
  durationMs: number;
  passed: number;
  failed: number;
  output: string;
}

/**
 * Runs the generated test suite inside the worktree using node --test.
 * Parses node:test summary for machine-readable counts.
 */
export function runTests(worktreePath: string, timeoutMs = 120_000): Promise<TestRunResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test"], {
      cwd: worktreePath,
      env: cleanTestEnv(),
      windowsHide: true,
    });
    let out = "";
    const cap = (d: Buffer) => {
      out += d.toString();
      if (out.length > 400_000) out = out.slice(-200_000);
    };
    child.stdout.on("data", cap);
    child.stderr.on("data", cap);
    child.on("error", (e) => {
      resolve({
        command: "node --test",
        exitCode: -1,
        durationMs: Date.now() - started,
        passed: 0,
        failed: 1,
        output: String(e),
      });
    });
    child.on("close", (code) => {
      const passM = /ℹ pass (\d+)/.exec(out) ?? /pass (\d+)/.exec(out);
      const failM = /ℹ fail (\d+)/.exec(out) ?? /fail (\d+)/.exec(out);
      resolve({
        command: "node --test",
        exitCode: code,
        durationMs: Date.now() - started,
        passed: Number(passM?.[1] ?? 0),
        failed: Number(failM?.[1] ?? (code === 0 ? 0 : 1)),
        output: out.slice(0, 100_000),
      });
    });
    setTimeout(() => child.kill("SIGKILL"), timeoutMs).unref?.();
  });
}

/** Writes generated files into the worktree. Returns absolute paths written. */
export function writeFiles(worktreePath: string, files: FileArtifact[]): string[] {
  const written: string[] = [];
  for (const f of files) {
    const abs = join(worktreePath, f.path);
    mkdirSync(join(abs, ".."), { recursive: true });
    if (!existsSync(abs) || readFileSync(abs, "utf8") !== f.content) {
      writeFileSync(abs, f.content);
    }
    written.push(abs);
  }
  return written;
}
