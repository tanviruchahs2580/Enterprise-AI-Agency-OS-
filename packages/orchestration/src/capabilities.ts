export type CapabilityId =
  | "mission-planning"
  | "delegation-orchestration"
  | "srs-authoring"
  | "acceptance-criteria"
  | "architecture-design"
  | "threat-modeling"
  | "backend-implementation"
  | "frontend-implementation"
  | "staff-engineering"
  | "ux-design"
  | "localization"
  | "database-schema"
  | "data-analytics"
  | "devops-iac"
  | "resilience-slo"
  | "qa-validation"
  | "performance-benchmarking"
  | "release-management"
  | "documentation"
  | "cited-research"
  | "support-triage"
  | "finops-cost"
  | "code-review"
  | "adversarial-validation";

export const CAPABILITY_IDS: readonly CapabilityId[] = [
  "mission-planning",
  "delegation-orchestration",
  "srs-authoring",
  "acceptance-criteria",
  "architecture-design",
  "threat-modeling",
  "backend-implementation",
  "frontend-implementation",
  "staff-engineering",
  "ux-design",
  "localization",
  "database-schema",
  "data-analytics",
  "devops-iac",
  "resilience-slo",
  "qa-validation",
  "performance-benchmarking",
  "release-management",
  "documentation",
  "cited-research",
  "support-triage",
  "finops-cost",
  "code-review",
  "adversarial-validation",
];

export interface CapabilityDef {
  id: CapabilityId;
  label: string;
  /** Capability conferred by owning these skills (resolved against registry). */
  skillNames?: string[];
  /** Capability conferred by explicit assignment (skill-less roles). */
  agentNames?: string[];
  /** Tools this kind of work typically needs (scored, not required). */
  suggestedTools?: string[];
}

/**
 * Capability directory (master prompt §9/§21). A capability is the matching
 * unit between "what a mission needs" and "which agents can do it". Agents
 * qualify via (a) owning a skill that confers the capability or (b) explicit
 * declaration for skill-less roles. Every roster agent must qualify for at
 * least one capability — that invariant is tested.
 */
export const CAPABILITY_DIRECTORY: CapabilityDef[] = [
  { id: "mission-planning", label: "Vision, mission decomposition, approval of high-risk decisions", agentNames: ["principal"] },
  { id: "delegation-orchestration", label: "Mission decomposition, dispatch, handoff contracts", agentNames: ["captain"] },
  { id: "srs-authoring", label: "SRS, edge cases, Definition of Ready", skillNames: ["srs-authoring"] },
  { id: "acceptance-criteria", label: "Acceptance criteria authoring and verification", skillNames: ["acceptance-criteria"] },
  {
    id: "architecture-design",
    label: "C4 diagrams, ADRs, system design",
    skillNames: ["adr-writing"],
    agentNames: ["architect", "staff-engineer"],
  },
  { id: "threat-modeling", label: "STRIDE threat models, risk posture", skillNames: ["threat-model-stride"] },
  {
    id: "backend-implementation",
    label: "API/service/data implementation with TDD",
    skillNames: ["tdd-red-green-refactor"],
    agentNames: ["backend-engineer"],
    suggestedTools: ["git.commit", "tests.run", "db.query"],
  },
  {
    id: "frontend-implementation",
    label: "Accessible UI implementation with e2e coverage",
    skillNames: ["tdd-red-green-refactor"],
    agentNames: ["frontend-engineer"],
    suggestedTools: ["tests.e2e"],
  },
  {
    id: "staff-engineering",
    label: "Deep module design, cross-cutting refactors, mentoring review",
    skillNames: ["tdd-red-green-refactor"],
    agentNames: ["staff-engineer"],
  },
  { id: "ux-design", label: "Interaction/visual design, a11y, content hierarchy", agentNames: ["ux-designer"] },
  { id: "localization", label: "i18n, locale bundles, RTL/LTR, pluralization", agentNames: ["localization-engineer"] },
  { id: "database-schema", label: "Reversible schema migrations, query performance", agentNames: ["database-engineer"], suggestedTools: ["db.migrate"] },
  { id: "data-analytics", label: "Metrics definitions, reporting models, dashboards", agentNames: ["data-analytics-engineer"], suggestedTools: ["db.query"] },
  { id: "devops-iac", label: "CI/CD, IaC, environments", agentNames: ["devops-engineer"], suggestedTools: ["deploy.staging"] },
  { id: "resilience-slo", label: "SLOs, error budgets, runbooks, incident response", agentNames: ["sre"], suggestedTools: ["observability-read"] },
  { id: "qa-validation", label: "Test strategy, coverage gates, exploratory testing", skillNames: ["coverage-gate-80-60"], agentNames: ["qa-engineer"] },
  { id: "performance-benchmarking", label: "Benchmarks before/after, load tests, profiling", agentNames: ["performance-engineer"], suggestedTools: ["load-test"] },
  { id: "release-management", label: "SemVer, changelogs, release trains, rollback", agentNames: ["release-manager"], suggestedTools: ["github.pr"] },
  { id: "documentation", label: "Diataxis docs, API references, runbooks", skillNames: ["diataxis-map"] },
  { id: "cited-research", label: "Cited research: source/date/confidence", skillNames: ["cited-research"] },
  { id: "support-triage", label: "Reproduction-first triage of inbound issues", agentNames: ["support-agent"] },
  { id: "finops-cost", label: "Cost tracking, budgets, savings recommendations", agentNames: ["finops-agent"] },
  { id: "code-review", label: "Standards-axis review: smells, design, tests", agentNames: ["code-reviewer"] },
  { id: "adversarial-validation", label: "Spec-fidelity axis: try to break the change", agentNames: ["adversarial-reviewer"] },
];

export function capabilityFor(id: string): CapabilityDef | undefined {
  return CAPABILITY_DIRECTORY.find((c) => c.id === id);
}

/**
 * Agents in `roster` that qualify for a capability. Skill-linked capabilities
 * resolve via the agent's `skills` list; explicit assignments always count.
 * Deduplicated, stable order (roster order).
 */
export function qualifyingAgents(
  capabilityId: CapabilityId,
  roster: { name: string; skills: string[] }[]
): string[] {
  const def = capabilityFor(capabilityId);
  if (!def) return [];
  const bySkill = new Set(def.skillNames ?? []);
  const byName = new Set(def.agentNames ?? []);
  const out: string[] = [];
  for (const agent of roster) {
    const hasSkill = [...bySkill].some((s) => agent.skills.includes(s));
    if (hasSkill || byName.has(agent.name)) out.push(agent.name);
  }
  return out;
}

/**
 * For every roster agent: which capabilities can route to it. Used by
 * reachability and to prove no agent is stranded (master prompt §21: every
 * agent reachable via at least one capability).
 */
export function reachableCapabilitiesFor(
  agentName: string,
  roster: { name: string; skills: string[] }[]
): CapabilityId[] {
  return CAPABILITY_IDS.filter((id) => qualifyingAgents(id, roster).includes(agentName));
}