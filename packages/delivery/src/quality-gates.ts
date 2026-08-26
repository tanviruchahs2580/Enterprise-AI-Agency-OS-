/**
 * PHASE 44 — Quality gates as explicit, machine-checkable definitions.
 * Each gate: entry criteria, automated checks, evidence requirements,
 * failure reasons. Used by delivery pipeline + certification scripts.
 */

export interface QualityGate {
  id: string;
  name: string;
  description: string;
  entryCriteria: string[];
  checks: { id: string; description: string; automated: boolean }[];
  evidenceRequired: string[];
  failureAction: "BLOCK" | "WARN" | "MANUAL_REVIEW";
}

export const QUALITY_GATES: Record<string, QualityGate> = {
  IMPLEMENTATION_READY: {
    id: "IMPLEMENTATION_READY",
    name: "Implementation Ready",
    description: "All prerequisites for autonomous implementation are satisfied.",
    entryCriteria: [
      "task.status = ready",
      "governance decision = ALLOW",
      "budget check passed",
    ],
    checks: [
      { id: "spec-valid", description: "deliverySpec parses and validates", automated: true },
      { id: "budget-ok", description: "org/project/daily budget allows $0 spend", automated: true },
      { id: "worktree-clean", description: "main workspace has no uncommitted changes", automated: true },
    ],
    evidenceRequired: ["Governance.gate event with decision=ALLOW"],
    failureAction: "BLOCK",
  },
  QA_READY: {
    id: "QA_READY",
    name: "QA Ready",
    description: "Generated code passes static analysis and contract verification.",
    entryCriteria: ["code_generated", "files written to worktree"],
    checks: [
      { id: "static-analysis", description: "no eval/require/io/prototype pollution in generated src/", automated: true },
      { id: "tests-green", description: "node --test exitCode=0 and failed=0", automated: true },
      { id: "contract-match", description: "exports match spec.ops exactly (arity checked)", automated: true },
    ],
    evidenceRequired: ["tests_run stage detail with pass/fail counts", "static_analysis findings count"],
    failureAction: "BLOCK",
  },
  SECURITY_READY: {
    id: "SECURITY_READY",
    name: "Security Ready",
    description: "No secrets, path traversal, debug code, or dangerous patterns in the diff.",
    entryCriteria: ["code_generated"],
    checks: [
      { id: "secret-leak", description: "no AWS keys / private keys / GH tokens / OpenAI keys in diff", automated: true },
      { id: "path-safety", description: "no path traversal or absolute paths in file list", automated: true },
      { id: "debug-code", description: "no console.log in generated src/", automated: true },
      { id: "scope-limit", description: "file count ≤ maxFiles and line count ≤ maxLines", automated: true },
    ],
    evidenceRequired: ["review_completed verdict + findings array"],
    failureAction: "BLOCK",
  },
  RELEASE_READY: {
    id: "RELEASE_READY",
    name: "Release Ready",
    description: "Merged main passes post-merge verification; SBOM generated; audit chain valid.",
    entryCriteria: ["merged (or converged)", "postmerge_verified passed=0 failed=0"],
    checks: [
      { id: "postmerge-tests", description: "node --test on merged main passes", automated: true },
      { id: "sbom-generated", description: "SBOM knowledge doc exists for this commit", automated: true },
      { id: "audit-chain", description: "/audit/verify returns valid:true", automated: true },
    ],
    evidenceRequired: ["postmerge_verified stage", "SBOM knowledge doc ID", "audit verify result"],
    failureAction: "BLOCK",
  },
};

/** Returns all gates applicable to a given lifecycle phase. */
export function gatesForPhase(phase: string): QualityGate[] {
  const map: Record<string, string[]> = {
    dispatch: ["IMPLEMENTATION_READY"],
    review: ["QA_READY", "SECURITY_READY"],
    merge: ["RELEASE_READY"],
  };
  return (map[phase] ?? []).map((id) => QUALITY_GATES[id]).filter((g): g is QualityGate => Boolean(g));
}
