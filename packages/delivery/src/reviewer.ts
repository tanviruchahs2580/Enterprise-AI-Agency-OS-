import type { FileArtifact } from "./types.ts";

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
  const majors = findings.filter((f) => f.severity === "major");
  let verdict: ReviewVerdict = "APPROVE";
  if (blockers.length > 0) verdict = "BLOCK";
  else if (majors.length > 0) verdict = "REQUEST_CHANGES";

  return { verdict, findings };
}
