import type { DeliverySpec, FileArtifact } from "./types.ts";

export type ReviewVerdict = "APPROVE" | "REQUEST_CHANGES" | "BLOCK";

export interface ReviewFinding {
  severity: "blocker" | "major" | "minor";
  rule: string;
  message: string;
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  findings: ReviewFinding[];
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key id"],
  [/-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/, "private key block"],
  [/ghp_[A-Za-z0-9]{30,}/, "github personal token"],
  [/sk-[A-Za-z0-9]{20,}/, "openai-style api key"],
];

/**
 * Deterministic reviewer core (Phase 7): mechanical gates that MUST hold
 * regardless of model confidence. An optional LLM advisory pass can extend
 * findings, but APPROVE is only possible with zero blocker/major findings.
 */
export function reviewDiff(
  files: FileArtifact[],
  opts?: { maxFiles?: number; maxTotalLines?: number }
): ReviewResult {
  const findings: ReviewFinding[] = [];
  const maxFiles = opts?.maxFiles ?? 12;
  const maxLines = opts?.maxTotalLines ?? 800;

  if (files.length === 0) {
    findings.push({ severity: "blocker", rule: "empty-diff", message: "no files produced" });
  }
  if (files.length > maxFiles) {
    findings.push({
      severity: "major",
      rule: "scope-limit",
      message: `${files.length} files exceeds maxFiles=${maxFiles}`,
    });
  }

  let totalLines = 0;
  for (const f of files) {
    totalLines += f.content.split("\n").length;

    for (const [re, what] of SECRET_PATTERNS) {
      if (re.test(f.content)) {
        findings.push({ severity: "blocker", rule: "secret-leak", message: `${what} in ${f.path}` });
      }
    }
    if (/TODO|FIXME|HACK/.test(f.content)) {
      findings.push({ severity: "minor", rule: "todo", message: `unresolved marker in ${f.path}` });
    }
    // generated runtime modules must not contain debug logging
    if (f.path.startsWith("src/") && /console\.log\(/.test(f.content)) {
      findings.push({ severity: "major", rule: "debug-code", message: `console.log in ${f.path}` });
    }
    // path traversal guard on declared paths
    if (f.path.includes("..") || /^[a-zA-Z]:/.test(f.path)) {
      findings.push({ severity: "blocker", rule: "path-safety", message: `unsafe path ${f.path}` });
    }
  }

  if (totalLines > maxLines) {
    findings.push({
      severity: "major",
      rule: "size-limit",
      message: `diff is ${totalLines} lines (limit ${maxLines})`,
    });
  }

  const blockers = findings.filter((f) => f.severity === "blocker");
  let verdict: ReviewVerdict = "APPROVE";
  if (blockers.length > 0) verdict = "BLOCK";
  else if (findings.some((f) => f.severity === "major")) verdict = "REQUEST_CHANGES";

  return { verdict, findings };
}

/**
 * PHASE B2 — LLM advisory layer (flag-gated by the caller).
 * Deterministic reviewDiff stays the AUTHORITY: advisory findings may only
 * WORSEN the verdict (APPROVE → REQUEST_CHANGES), never improve it, and can
 * never introduce BLOCK. Deduped against base by rule+path.
 */
export function mergeAdvisories(
  base: ReviewResult,
  advisory: ReviewFinding[]
): ReviewResult {
  const seen = new Set(base.findings.map((f) => `${f.rule}|${f.message}`));
  const mergedFindings = [...base.findings];
  for (const a of advisory) {
    if (a.severity === "blocker") continue; // advisory can never BLOCK
    const key = `${a.rule}|${a.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mergedFindings.push(a);
  }
  const majors = mergedFindings.filter((f) => f.severity === "major").length;
  let verdict: ReviewVerdict = base.verdict;
  if (verdict === "APPROVE" && majors > 0) {
    verdict = "REQUEST_CHANGES"; // worsen only
  }
  return { verdict, findings: mergedFindings };
}

/** Builds the advisory callback used by the pipeline when flag+provider exist. */
export function makeAdvisoryReviewer(opts: {
  complete: (prompt: string) => Promise<string>;
  spec: DeliverySpec;
}): (diffSummary: string) => Promise<ReviewFinding[]> {
  return async (diffSummary: string): Promise<ReviewFinding[]> => {
    const raw = await Promise.race([
      opts.complete(
        `You are an advisory code reviewer. Review this diff summary for module '${opts.spec.moduleName}'. ` +
        `Return ONLY a JSON array of findings [{severity:"minor"|"major", rule:string, path:string, message:string}]. ` +
        `Severity must never be blocker. Diff summary:\n${diffSummary}`
      ),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("advisory timeout")), 30_000)),
    ]);
    const m = /\[[\s\S]*\]/.exec(raw);
    if (!m) return [];
    const arr = JSON.parse(m[0]) as { severity?: string; rule?: string; path?: string; message?: string }[];
    return (Array.isArray(arr) ? arr : [])
      .filter((x) => x && (x.severity === "major" || x.severity === "minor"))
      .slice(0, 20)
      .map((x) => ({
        severity: x.severity as "major" | "minor",
        rule: String(x.rule ?? "llm-advisory"),
        message: String(x.message ?? "").slice(0, 300),
        path: String(x.path ?? opts.spec.moduleName).replace(/\.\./g, ""),
      }));
  };
}
