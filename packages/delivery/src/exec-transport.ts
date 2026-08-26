import { spawn } from "node:child_process";

/**
 * Phase A/F-04: every generated/untrusted-code execution MUST go through an
 * ExecTransport. The control plane wires the implementation from
 * SANDBOX_PROVIDER (docker → DockerExecTransport, else ProcessTransport).
 * Direct `spawn` of node is forbidden outside this file.
 */

export interface ExecResult {
  argv: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ExecTransport {
  readonly name: "process" | "docker";
  exec(argv: string[], opts: { cwd: string; timeoutMs?: number }): Promise<ExecResult>;
}

export class ProcessTransport implements ExecTransport {
  readonly name = "process" as const;
  exec(argv: string[], opts: { cwd: string; timeoutMs?: number }): Promise<ExecResult> {
    return new Promise((resolve) => {
      const child = spawn(argv[0]!, argv.slice(1), {
        cwd: opts.cwd,
        windowsHide: true,
        env: Object.fromEntries(
          Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT")
        ),
      });
      let stdout = "";
      let stderr = "";
      const cap = (d: Buffer) => {
        stdout += d.toString();
        stderr += d.toString();
        if (stdout.length > 400_000) stdout = stdout.slice(-200_000);
        if (stderr.length > 100_000) stderr = stderr.slice(-50_000);
      };
      child.stdout.on("data", cap);
      child.stderr.on("data", cap);
      child.on("error", (e) =>
        resolve({ argv, cwd: opts.cwd, exitCode: -1, stdout, stderr: String(e) })
      );
      child.on("close", (code) =>
        resolve({ argv, cwd: opts.cwd, exitCode: code, stdout, stderr })
      );
      if (opts.timeoutMs) setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs).unref();
    });
  }
}

/**
 * Executes the SAME argv inside a sibling container via `docker exec`.
 * Requires AGENT_EXEC_CONTAINER_ID (the agent-sandbox container joined to the
 * same volume/network). Fail-closed: without it, exec rejects.
 */
export class DockerExecTransport implements ExecTransport {
  readonly name = "docker" as const;
  private readonly containerId?: string;

  // no parameter properties (ADR-0003)
  constructor(containerId?: string) {
    this.containerId = containerId;
  }
  // no parameter properties (ADR-0003)

  /** Pure helper (unit-testable): prefix argv so that argv[0] === 'docker'. */
  buildArgv(argv: string[]): string[] {
    if (!this.containerId) {
      throw new Error("AGENT_EXEC_CONTAINER_ID not configured for docker exec transport");
    }
    return ["docker", "exec", "-w", "/sandbox/worktree", this.containerId, ...argv];
  }

  exec(argv: string[], opts: { cwd: string; timeoutMs?: number }): Promise<ExecResult> {
    const full = this.buildArgv(argv); // throws fail-closed when unconfigured
    return new Promise((resolve) => {
      const child = spawn(full[0]!, full.slice(1), { windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (e) => resolve({ argv: full, cwd: opts.cwd, exitCode: -1, stdout, stderr: String(e) }));
      child.on("close", (code) => resolve({ argv: full, cwd: opts.cwd, exitCode: code, stdout, stderr }));
      if (opts.timeoutMs) setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs).unref();
    });
  }
}

export const processTransport = new ProcessTransport();

export function selectTransport(provider: string, dockerContainerId?: string): ExecTransport {
  if (provider === "docker") return new DockerExecTransport(dockerContainerId);
  return processTransport;
}
