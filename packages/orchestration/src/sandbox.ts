import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { newId, AppError } from "@agency/core";

export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ExecOptions {
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: Record<string, string>;
}

export interface SandboxProvider {
  readonly kind: "process" | "docker";
  available(): Promise<boolean>;
  exec(argv: string[], opts: ExecOptions): Promise<ExecResult>;
}

/** Commands that are always refused regardless of policy (defense in depth). */
const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+-rf?\s+[/~]/,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/, // fork bomb
  /mkfs(\.\w+)?\s/,
  /dd\s+if=.*of=\/dev\/(sd|nvme|hd)/,
  /shutdown|reboot|halt\s/,
  />\s*\/dev\/(sd|nvme|hd)/,
];

export function assertCommandSafe(commandLine: string): void {
  for (const p of BLOCKED_PATTERNS) {
    if (p.test(commandLine)) {
      throw new AppError("FORBIDDEN", `destructive command blocked: ${commandLine.slice(0, 80)}`);
    }
  }
}

function cap(buf: string[], maxBytes: number): string {
  const s = buf.join("");
  return s.length > maxBytes ? s.slice(0, maxBytes) + "…[truncated]" : s;
}

/**
 * Development/test sandbox: direct child process with timeout + output caps +
 * destructive-command screening. NOT a security boundary — production must use
 * the Docker provider (ADR-0006). Boot config refuses process sandbox in prod.
 */
export class ProcessSandbox implements SandboxProvider {
  readonly kind = "process" as const;

  async available(): Promise<boolean> {
    return true;
  }

  async exec(argv: string[], opts: ExecOptions): Promise<ExecResult> {
    assertCommandSafe(argv.join(" "));
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const maxOut = opts.maxOutputBytes ?? 512_000;

    return new Promise((resolve) => {
      const child = spawn(argv[0]!, argv.slice(1), {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        shell: false,
        windowsHide: true,
      });
      const out: string[] = [];
      const err: string[] = [];
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.stdout?.on("data", (d) => out.push(String(d)));
      child.stderr?.on("data", (d) => err.push(String(d)));
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ exitCode: null, stdout: "", stderr: String(e), timedOut });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout: cap(out, maxOut),
          stderr: cap(err, maxOut),
          timedOut,
        });
      });
    });
  }
}

/**
 * Docker sandbox: one-shot container per exec with no network by default and
 * bounded resources. Requires the docker CLI; availability is checked lazily.
 */
export class DockerSandbox implements SandboxProvider {
  readonly kind = "docker" as const;
  private readonly image: string;
  private readonly inner: SandboxProvider;

  constructor(
    image: string = "node:24-bookworm-slim",
    inner: SandboxProvider = new ProcessSandbox()
  ) {
    this.image = image;
    this.inner = inner;
  }

  async available(): Promise<boolean> {
    const res = await this.inner.exec(["docker", "version", "--format", "{{.Server.Version}}"], {
      cwd: ".",
      timeoutMs: 10_000,
    });
    return res.exitCode === 0;
  }

  async exec(argv: string[], opts: ExecOptions): Promise<ExecResult> {
    assertCommandSafe(argv.join(" "));
    const ok = await this.available();
    if (!ok) {
      throw new AppError("DEPENDENCY_UNAVAILABLE", "docker daemon unreachable");
    }
    const memLimit = "512m";
    const cpus = "1.0";
    const pidsMax = "128";
    const dockerArgv = [
      "docker", "run", "--rm",
      "--network", "none",
      "--memory", memLimit,
      "--cpus", cpus,
      "--pids-limit", pidsMax,
      "--read-only",
      "--tmpfs", "/tmp:rw,size=64m",
      "-v", `${opts.cwd}:/workspace`,
      "-w", "/workspace",
      this.image,
      ...argv,
    ];
    return this.inner.exec(dockerArgv, { ...opts, timeoutMs: (opts.timeoutMs ?? 120_000) + 15_000 });
  }
}

export function workspaceRoot(baseDir: string): string {
  const dir = join(baseDir, "workspaces", newId("ws"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupWorkspace(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
