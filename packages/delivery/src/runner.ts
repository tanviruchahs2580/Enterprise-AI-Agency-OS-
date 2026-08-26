import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { processTransport, type ExecTransport } from "./exec-transport.ts";

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
 * Runs the generated test suite inside the worktree using node --test,
 * routed through the configured ExecTransport (Phase A/F-04).
 */
export async function runTests(
  worktreePath: string,
  timeoutMs = 120_000,
  transport: ExecTransport = processTransport
): Promise<TestRunResult> {
  const started = Date.now();
  const res = await transport.exec([process.execPath, "--test"], {
    cwd: worktreePath,
    timeoutMs,
  });
  const out = res.stdout + "\n" + res.stderr;
  const passM = /ℹ pass (\d+)/.exec(out) ?? /pass (\d+)/.exec(out);
  const failM = /ℹ fail (\d+)/.exec(out) ?? /fail (\d+)/.exec(out);
  return {
    command: "node --test",
    exitCode: res.exitCode,
    durationMs: Date.now() - started,
    passed: Number(passM?.[1] ?? 0),
    failed: Number(failM?.[1] ?? (res.exitCode === 0 ? 0 : 1)),
    output: out.slice(0, 100_000),
  };
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
