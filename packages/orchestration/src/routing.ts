import type { ModelTier } from "@agency/models";
import { AGENT_ROSTER, type AgentDefinition, type ToolId } from "./agents.ts";
import { qualifyingAgents, capabilityFor, type CapabilityId } from "./capabilities.ts";

export type AgentProfile = Pick<
  AgentDefinition,
  "name" | "allowedTools" | "forbiddenTools" | "modelTier" | "budgetUsd" | "skills"
>;

export const ROSTER_PROFILES: AgentProfile[] = AGENT_ROSTER.map((a) => ({
  name: a.name,
  allowedTools: a.allowedTools,
  forbiddenTools: a.forbiddenTools,
  modelTier: a.modelTier,
  budgetUsd: a.budgetUsd,
  skills: a.skills,
}));

export interface RoutingCandidate {
  agentId: string;
  score: number;
  /** Human-readable, auditable rationale for this agent's score. */
  reasons: string[];
}

export interface RoutingDecision {
  requiredCapabilities: string[];
  preferredAgent?: string;
  risk?: "low" | "medium" | "high";
  primaryAgentId: string;
  candidates: RoutingCandidate[];
  whyAgentSelected: string;
  policyVersion: number;
}

export interface RoutingRequest {
  requiredCapabilities: string[];
  preferredAgent?: string;
  preferredTier?: ModelTier;
  risk?: "low" | "medium" | "high";
  /** Org roster (persisted rows) when provided; otherwise the enterprise roster. */
  roster?: AgentProfile[];
  requiredTools?: ToolId[];
}

export const ROUTING_POLICY_VERSION = 1;

const TIER_ORDER: Record<ModelTier, number> = {
  FAST: 0,
  LOCAL: 0,
  VISION: 0,
  STANDARD: 1,
  REASONING: 2,
  SECURITY: 2,
  REVIEW: 2,
};

const RISK_AWARE_ROLES = new Set([
  "security-engineer",
  "adversarial-reviewer",
  "principal",
  "sre",
  "performance-engineer",
  "code-reviewer",
]);

/**
 * Deterministic capability router (master prompt §9/§6: "auditable dispatch —
 * the system explains why this agent, not its alternate"). No LLM: eligibility
 * derives from the capability directory + agent contracts (tools/tier/budget),
 * and scoring is a fixed weighted formula so identical inputs always yield the
 * same decision, which is what makes the routing_decisions audit trail useful.
 */
export class CapabilityRouter {
  route(req: RoutingRequest): RoutingDecision {
    const roster = (req.roster && req.roster.length > 0 ? req.roster : ROSTER_PROFILES).map(
      (a, i) => ({ ...a, _order: i })
    );
    const candidates: RoutingCandidate[] = [];
    const requiredCount = Math.max(1, req.requiredCapabilities.length);
    const requiredTools = req.requiredTools ?? [];

    for (const agent of roster) {
      const reasons: string[] = [];
      let coverage = 0;
      for (const cap of req.requiredCapabilities) {
        if (qualifyingAgents(cap as CapabilityId, roster).includes(agent.name)) {
          coverage++;
          reasons.push(`qualifies capability '${cap}'`);
        }
      }
      if (coverage === 0) continue;
      const coverageScore = (coverage / requiredCount) * 40;

      const forbiddenHit = agent.forbiddenTools.some((t) => requiredTools.includes(t));
      const toolHit = requiredTools.every((t) => agent.allowedTools.includes(t));
      const toolScore = toolHit ? 30 : forbiddenHit ? 5 : 20;
      reasons.push(
        toolHit
          ? "all required tools eligible"
          : forbiddenHit
            ? "a required tool is on this agent's forbidden list"
            : "some required tools missing"
      );

      const tierScore = tierFitScore(agent, req);
      reasons.push(tierScore === 30 ? "tier matches the work profile" : "tier is acceptable but not ideal");

      let riskBonus = 0;
      if (req.risk === "high" && RISK_AWARE_ROLES.has(agent.name)) {
        riskBonus = 10;
        reasons.push("risk-aware role for high-risk work");
      }

      const preferredBonus = req.preferredAgent === agent.name ? 20 : 0;
      if (preferredBonus) reasons.push("caller preferred this agent");

      // Canonical-role bonus: agents explicitly declared for a capability beat
      // tie-scored skill-conferred alternates, so the obvious choice wins ties.
      const explicitFor = req.requiredCapabilities.filter((cap) =>
        capabilityFor(cap)?.agentNames?.includes(agent.name)
      ).length;
      const explicitBonus = explicitFor > 0 ? explicitFor * 5 : 0;
      if (explicitBonus) reasons.push(`canonical role for ${explicitFor} required capability(ies)`);

      const score = coverageScore + toolScore + tierScore + riskBonus + preferredBonus + explicitBonus;
      candidates.push({
        agentId: agent.name,
        score: Math.round(score * 100) / 100,
        reasons: dedupe(reasons),
      });
    }

    candidates.sort(
      (a, b) => b.score - a.score || roster.findIndex((r) => r.name === a.agentId) - roster.findIndex((r) => r.name === b.agentId)
    );

    const primary = candidates[0];
    return {
      requiredCapabilities: [...req.requiredCapabilities],
      preferredAgent: req.preferredAgent,
      risk: req.risk,
      primaryAgentId: primary?.agentId ?? "",
      candidates,
      whyAgentSelected: primary
        ? `highest score ${primary.score} across ${primary.reasons.length} auditable reason(s)`
        : "no agent matches any required capability — review capability directory",
      policyVersion: ROUTING_POLICY_VERSION,
    };
  }
}

function tierFitScore(agent: AgentProfile & { _order: number }, req: RoutingRequest): number {
  if (req.preferredTier && agent.modelTier === req.preferredTier) return 30;
  if (req.risk === "high" && TIER_ORDER[agent.modelTier] >= 2) return 30;
  if (!req.preferredTier && req.risk !== "high") return 30; // no tier constraint → neutral
  return 15;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  return out;
}