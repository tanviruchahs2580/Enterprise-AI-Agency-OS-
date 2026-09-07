import type { AgentDefinition, ToolId } from "./agents.ts";
import type { ModelTier } from "@agency/models";

/**
 * Agent Contract V2 (§5) — 24 fields, versioned, repository-defined.
 * Extends V1 (12 fields) with enterprise governance:
 * `preconditions/postconditions/success/failure criteria, retry/escalation/rollback,
 * requiredEvidence, contextPolicy, artifactTypes, ownershipScope,
 * decisionAuthority, riskPolicy`
 */
export interface AgentContractV2 extends AgentDefinition {
  /** Contract version (SemVer) — prompts are code (§97 R7) */
  version: string;
  /** Stable id (kebab, e.g., "backend-engineer") */
  id: string;
  /** Guard: when true agent may run stage */
  preconditions: string[];
  /** Must hold after success */
  postconditions: string[];
  /** Measurable done — maps to verificationPolicy + evidence */
  successCriteria: string[];
  /** When to mark FAILED (not retry) */
  failureCriteria: string[];
  /** Retry policy — parsed by SkillRuntime.parseFailureHandling */
  retryPolicy: { maxAttempts: number; delayMs: number; backoff: "fixed" | "exponential" };
  /** Escalation target when retry exhausted */
  escalationPolicy: { target: string; level: "principal" | "human" };
  /** Compensation on failure / rollback */
  rollbackPolicy: { strategy: "revert" | "compensate" | "manual"; steps: string[] };
  /** Evidence that must exist for PASS (maps to evidence_records.type) */
  requiredEvidence: string[];
  /** What context engine may send (bounded, traceable) */
  contextPolicy: { maxFiles: number; maxTokens: number; allowSecrets: false };
  /** Artifacts this agent may produce */
  artifactTypes: ("code" | "test" | "doc" | "adr" | "threat_model" | "plan" | "handoff" | "sbom")[];
  /** Ownership scope (project/module) */
  ownershipScope: string;
  /** Decision authority (what it may approve) */
  decisionAuthority: ("none" | "code" | "architecture" | "release" | "incident")[];
  /** Risk policy — maps to dynamic permission (§8) */
  riskPolicy: { maxRisk: "low" | "medium" | "high" | "critical"; requiresApproval: boolean };
}

/** Migrate V1 roster to V2 with safe defaults (§13) */
export function toV2(def: AgentDefinition): AgentContractV2 {
  const tierRisk = (def.modelTier === "REASONING" || def.modelTier === "SECURITY" || def.modelTier === "REVIEW") ? "high" as const : "medium" as const;
  return {
    ...def,
    id: def.name,
    version: "1.0.0",
    preconditions: def.skills.length ? [`skill:${def.skills[0]} available`] : [],
    postconditions: [def.verificationPolicy],
    successCriteria: [def.verificationPolicy],
    failureCriteria: ["verification_failed", "timeout", "budget_exceeded"],
    retryPolicy: { maxAttempts: def.maxIterations > 10 ? 3 : 1, delayMs: 500, backoff: "exponential" },
    escalationPolicy: { target: "principal", level: "principal" },
    rollbackPolicy: { strategy: "revert", steps: ["git revert", "record failure memory"] },
    requiredEvidence: def.skills.includes("tdd-red-green-refactor") ? ["test-result"] : [],
    contextPolicy: { maxFiles: 12, maxTokens: 8000, allowSecrets: false },
    artifactTypes: def.skills.includes("tdd-red-green-refactor") ? ["code", "test"] : ["doc"],
    ownershipScope: def.role,
    decisionAuthority: def.role === "PRINCIPAL" ? ["release", "architecture"] : def.role === "REVIEW" ? ["code"] : ["none"],
    riskPolicy: { maxRisk: tierRisk, requiresApproval: tierRisk === "high" },
  };
}
