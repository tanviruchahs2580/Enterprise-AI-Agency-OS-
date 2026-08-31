import type { CapabilityId } from "./capabilities.ts";

export type MissionComplexity = "simple" | "medium" | "complex" | "enterprise";
export type MissionRisk = "low" | "medium" | "high";
export type VerificationLevel = "deterministic" | "deterministic+review" | "deterministic+review+evidence";

export interface MissionInput {
  objective: string;
  scope?: string;
  constraints?: string[];
  acceptanceCriteria?: string[];
}

export interface MissionPlan {
  objective: string;
  complexity: MissionComplexity;
  risk: MissionRisk;
  requiredCapabilities: CapabilityId[];
  recommendedVerification: VerificationLevel;
  reasons: string[];
}

const ENTERPRISE_RE = /enterprise|multi-\w+|platform|orchestrat|ecosystem|cross-cutting|rollout/i;
const COMPLEX_RE = /integrat|refactor|migration|multi-step|distributed|concurr|realtime|complex/i;
const HIGH_RISK_RE =
  /\b(auth[a-z]*|sso|oidc|payment|billing|secret[s]?|credential|rotate|deploy\.production|production|prod|pci|pii|gdpr|encrypt[a-z]*|penetrat|security|vault|disaster|rollback|key\s+management)\b/i;
const MEDIUM_RISK_RE =
  /\b(deploy|staging|integration|api|network|import|export|release|performance|scal[a-z]*|observab[a-z]*)\b/i;

/**
 * Deterministic mission compiler (master prompt §4/§22): classifies a mission
 * objective into complexity/risk tiers, derives required capabilities and the
 * verification level — no LLM, so two identical inputs produce identical plans.
 */
export class MissionCompiler {
  compile(input: MissionInput): MissionPlan {
    const objective = String(input.objective ?? "").trim();
    const reasons: string[] = [];
    if (!objective) {
      return {
        objective,
        complexity: "simple",
        risk: "low",
        requiredCapabilities: [],
        recommendedVerification: "deterministic",
        reasons: ["empty objective — treat as unspecified, low-confidence plan"],
      };
    }

    const constraints = input.constraints ?? [];
    const criteria = input.acceptanceCriteria ?? [];
    const scopeKernels = (input.scope ?? "")
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean).length;

    const complexity = classifyComplexity(objective, scopeKernels, criteria.length, reasons);
    const risk = classifyRisk(objective, constraints, reasons);
    const requiredCapabilities = deriveCapabilities(objective, complexity, risk, reasons);
    const recommendedVerification: VerificationLevel =
      risk === "high"
        ? "deterministic+review+evidence"
        : complexity === "enterprise" || risk === "medium"
          ? "deterministic+review"
          : "deterministic";

    return {
      objective,
      complexity,
      risk,
      requiredCapabilities,
      recommendedVerification,
      reasons: dedupe(reasons),
    };
  }
}

function classifyComplexity(
  objective: string,
  scopeKernels: number,
  acceptanceCount: number,
  reasons: string[]
): MissionComplexity {
  const enterprise = ENTERPRISE_RE.test(objective) || scopeKernels >= 6 || acceptanceCount >= 8;
  if (enterprise) {
    reasons.push("enterprise scope: ≥6 scope kernels, ≥8 acceptance criteria, or enterprise keywords");
    return "enterprise";
  }
  if (COMPLEX_RE.test(objective) || scopeKernels >= 3 || acceptanceCount >= 4) {
    reasons.push("complex scope: integration/refactor keywords or 3+ scope kernels");
    return "complex";
  }
  if (scopeKernels >= 2 || acceptanceCount >= 2 || objective.length > 140) {
    reasons.push("medium scope: multi-kernel or multi-criteria objective");
    return "medium";
  }
  reasons.push("simple scope: single kernel, short objective");
  return "simple";
}

function classifyRisk(objective: string, constraints: string[], reasons: string[]): MissionRisk {
  const corpus = [objective, ...constraints].join(" ");
  if (HIGH_RISK_RE.test(corpus)) {
    reasons.push("high risk: authentication/payment/secret/migration/production keywords");
    return "high";
  }
  if (MEDIUM_RISK_RE.test(corpus)) {
    reasons.push("medium risk: deploy/integration/api/performance keywords");
    return "medium";
  }
  reasons.push("low risk: no risk-elevating keywords");
  return "low";
}

function deriveCapabilities(
  objective: string,
  complexity: MissionComplexity,
  risk: MissionRisk,
  reasons: string[]
): CapabilityId[] {
  const caps: CapabilityId[] = [];
  const add = (c: CapabilityId, why: string) => {
    if (!caps.includes(c)) {
      caps.push(c);
      reasons.push(why);
    }
  };

  if (complexity === "enterprise" || complexity === "complex") {
    add("mission-planning", "mission-planning required for non-trivial decomposition");
    add("delegation-orchestration", "delegation-orchestration required for multi-stage dispatch");
  }
  if (complexity === "medium" || complexity === "complex" || complexity === "enterprise") {
    add("srs-authoring", "srs-authoring required — objectives need an SRS");
    add("acceptance-criteria", "acceptance-criteria required — measurable done-ness");
    add("architecture-design", "architecture-design required for scoped work");
    add("qa-validation", "qa-validation applies to every implementation");
  }
  if (risk === "high") {
    add("threat-modeling", "threat-modeling required for high-risk work");
    add("code-review", "code-review required for high-risk changes");
    add("adversarial-validation", "adversarial-validation required for high-risk changes");
  }
  if (complexity === "enterprise") {
    add("release-management", "release-management required for enterprise rollout");
  }
  void objective;
  return caps;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}