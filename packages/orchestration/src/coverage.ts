import { AGENT_ROSTER, type AgentDefinition } from "./agents.ts";
import { defaultWorkflowDefinition, type WorkflowDefinition } from "./workflow.ts";
import { reachableCapabilitiesFor } from "./capabilities.ts";

export interface ReachabilityItem {
  agentId: string;
  reachable: boolean;
  /** Concrete, validated paths by which this agent can be invoked. */
  via: string[];
}

export interface ReachabilityReport {
  total: number;
  reachableCount: number;
  unreachable: string[];
  items: ReachabilityItem[];
}

export interface ReachabilityInput {
  agents?: Pick<AgentDefinition, "name" | "skills">[];
  skills?: string[] | Set<string>;
  workflowTemplates?: WorkflowDefinition[];
}

/**
 * Roster reachability (master prompt §21: every agent reachable through at
 * least one concrete path). A path only counts if it *resolves*:
 *  - skill path requires the skill to exist in the loaded registry
 *  - workflow path requires a template (or the default workflow) to actually
 *    name that agent as the stage role
 *  - capability path requires the capability directory to route to the agent
 * Fictional paths never count — reachability is computed, not claimed.
 */
export function computeReachability(input: ReachabilityInput = {}): ReachabilityReport {
  const agents = (input.agents ?? AGENT_ROSTER).map((a) => ({
    name: a.name,
    skills: a.skills ?? [],
  }));
  const skills = new Set<string>(input.skills ?? []);
  const templates = [
    defaultWorkflowDefinition(),
    ...(input.workflowTemplates ?? []),
  ];

  const items: ReachabilityItem[] = [];
  for (const agent of agents) {
    const via: string[] = [];
    for (const s of agent.skills) {
      if (skills.has(s)) via.push(`skill:${s}`);
    }
    for (const t of templates) {
      for (const stage of t.stages) {
        if (stage.agentRole === agent.name) via.push(`workflow:${t.name}:${stage.name}`);
        for (const branch of stage.fanOut ?? []) {
          if (branch.agentRole === agent.name) via.push(`workflow:${t.name}:${stage.name}/fanout:${branch.name}`);
        }
      }
    }
    for (const cap of reachableCapabilitiesFor(agent.name, agents)) {
      via.push(`capability:${cap}`);
    }
    items.push({ agentId: agent.name, reachable: via.length > 0, via: dedupe(via) });
  }
  const unreachable = items.filter((i) => !i.reachable).map((i) => i.agentId);
  return { total: items.length, reachableCount: items.length - unreachable.length, unreachable, items };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}