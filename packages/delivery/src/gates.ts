import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { processTransport, type ExecTransport } from "./exec-transport.ts";
import type { DeliverySpec, FileArtifact } from "./types.ts";

/**
 * Deterministic quality gates added under the AGENCY_OS master pipeline:
 *   static_analysis  — fail-closed source rules (no eval/dynamic-require/io)
 *   contract_verified — exported surface must equal spec.ops exactly
 *   benchmark_run    — per-op average latency via out-of-process child
 */

export interface StaticFinding {
  rule: string;
  path: string;
  message: string;
}

const STATIC_RULES: [RegExp, string][] = [
  [/\beval\s*\(/, "eval() is forbidden"],
  [/new Function\s*\(/, "new Function() is forbidden"],
  [/\brequire\s*\(/, "dynamic require() is forbidden in ESM modules"],
  [/import\s+(.*)\s*from\s+["'](node:)?(fs|child_process|net|http|https|dns|worker_threads)["']/, "io/network imports are forbidden in generated pure modules"],
  [/\bprocess\.global\b/, "process.global is forbidden"],
  [/__proto__\s*=/, "prototype pollution pattern forbidden"],
];

export function staticScan(files: FileArtifact[]): StaticFinding[] {
  const findings: StaticFinding[] = [];
  for (const f of files) {
    if (!f.path.startsWith("src/")) continue; // gates apply to runtime module code
    for (const [re, message] of STATIC_RULES) {
      if (re.test(f.content)) {
        findings.push({ rule: re.source.slice(0, 40), path: f.path, message });
      }
    }
  }
  return findings;
}

export function contractCheck(spec: DeliverySpec, files: FileArtifact[]): { ok: boolean; problems: string[] } {
  const mod = files.find((f) => f.path === `src/${spec.moduleName}.js`);
  if (!mod) return { ok: false, problems: [`src/${spec.moduleName}.js not produced`] };
  const exported = new Map<string, number>();
  for (const m of mod.content.matchAll(/export function (\w+)\(([^)]*)\)/g)) {
    const name = m[1]!;
    exported.set(name, m[2]!.split(",").filter(Boolean).length);
  }
  const problems: string[] = [];
  for (const op of spec.ops) {
    const arity = exported.get(op.name);
    if (arity === undefined) problems.push(`missing export: ${op.name}`);
    else if (arity !== op.arity) problems.push(`${op.name}: arity ${arity} != spec ${op.arity}`);
  }
  for (const name of exported.keys()) {
    if (!spec.ops.some((o) => o.name === name)) problems.push(`undeclared export: ${name}`);
  }
  return { ok: problems.length === 0, problems };
}

export interface BenchResult {
  op: string;
  iterations: number;
  avgMs: number;
}

/** PHASE B5: effective budget with clamps (spec-supplied values are untrusted). */
export function resolvePerfBudget(spec: DeliverySpec): { avgMsPerOp: number; iterations: number } {
  const raw = spec.perfBudget ?? {};
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const avg = Number.isFinite(raw.avgMsPerOp) ? clamp(raw.avgMsPerOp!, 0.01, 1000) : 5;
  const iters = Number.isFinite(raw.iterations) ? clamp(Math.round(raw.iterations!), 100, 1_000_000) : 20_000;
  return { avgMsPerOp: avg, iterations: iters };
}

export function validatePerfBudget(
  input: unknown
): { ok: true; clamped: { avgMsPerOp?: number; iterations?: number } } | { ok: false; reason: string } {
  if (input === undefined) return { ok: true, clamped: {} };
  if (typeof input !== "object" || input === null) return { ok: false, reason: "perfBudget must be an object" };
  const b = input as { avgMsPerOp?: unknown; iterations?: unknown };
  const out: { avgMsPerOp?: number; iterations?: number } = {};
  if (b.avgMsPerOp !== undefined) {
    const v = Number(b.avgMsPerOp);
    if (!Number.isFinite(v) || v < 0.01 || v > 1000) return { ok: false, reason: "perfBudget.avgMsPerOp must be within [0.01,1000]" };
    out.avgMsPerOp = v;
  }
  if (b.iterations !== undefined) {
    const v = Number(b.iterations);
    if (!Number.isInteger(v) || v < 100 || v > 1_000_000) return { ok: false, reason: "perfBudget.iterations must be integer within [100,1000000]" };
    out.iterations = v;
  }
  return { ok: true, clamped: out };
}

/** Out-of-process micro-benchmark: never trusts generated code inside the agent. */
export function runBenchmark(
  worktreePath: string,
  spec: DeliverySpec,
  timeoutMs = 60_000,
  transport: ExecTransport = processTransport
): Promise<{ results: BenchResult[]; budget: { avgMsPerOp: number; iterations: number }; pass: boolean }> {
  const budget = resolvePerfBudget(spec);
  const N = budget.iterations;
  const moduleUrl = pathToFileURL(join(worktreePath, "src", `${spec.moduleName}.js`)).href;
  const code = `
const mod = await import(${JSON.stringify(moduleUrl)});
const ops = ${JSON.stringify(spec.ops.map((o) => o.name))};
const N = ${N};
const out = [];
for (const name of ops) {
  const fn = mod[name];
  if (typeof fn !== 'function') { out.push({ op: name, iterations: 0, avgMs: NaN }); continue; }
  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < N; i++) acc += fn(i, i + 1);
  if (acc === -1) console.error('impossible');
  out.push({ op: name, iterations: N, avgMs: (performance.now() - t0) / N });
}
console.log('BENCH_JSON:' + JSON.stringify(out));
`;
  return transport.exec([process.execPath, "--input-type=module", "-e", code], {
    cwd: worktreePath,
    timeoutMs,
  }).then((res) => {
    const line = res.stdout.split("\n").find((l) => l.startsWith("BENCH_JSON:"));
    const done = (results: BenchResult[]) =>
      ({ results, budget, pass: results.every((r) => Number.isFinite(r.avgMs) && r.avgMs < budget.avgMsPerOp) });
    if (!line) return done([]);
    try { return done(JSON.parse(line.slice("BENCH_JSON:".length))); } catch { return done([]); }
  });
}
