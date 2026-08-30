import { newId, AppError } from "@agency/core";
import type { Db } from "@agency/db";
import { AGENT_ROSTER, type AgentDefinition } from "./agents.ts";

export interface RegisteredAgent extends AgentDefinition {
  id: string;
  status: string;
  heartbeatAt?: string;
}

/** DB-backed registry seeded from the enterprise roster. */
export class AgentRegistry {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  seedRoster(orgId: string): number {
    const now = this.db.now();
    let n = 0;
    this.db.transaction(() => {
      for (const a of AGENT_ROSTER) {
        const exists = this.db.get<{ id: string }>(
          "SELECT id FROM agents WHERE org_id = ? AND name = ?",
          [orgId, a.name]
        );
        if (exists) {
          // Roster sync: the seed is the source of truth for contract fields,
          // so risk-weighted budgets and skill assignments reach existing orgs
          // on re-seed. Status/heartbeat/auth state is never touched.
          this.db.driver.run(
            `UPDATE agents SET role = ?, description = ?, allowed_tools = ?, forbidden_tools = ?,
             model_policy = ?, max_iterations = ?, timeout_ms = ?, budget_usd = ?, skills = ?, updated_at = ?
             WHERE id = ?`,
            [
              a.role,
              a.description,
              JSON.stringify(a.allowedTools),
              JSON.stringify(a.forbiddenTools),
              JSON.stringify({ tier: a.modelTier }),
              a.maxIterations,
              a.timeoutMs,
              a.budgetUsd,
              JSON.stringify(a.skills ?? []),
              now,
              exists.id,
            ]
          );
          continue;
        }
        this.db.insert("agents", {
          id: newId("agt"),
          org_id: orgId,
          name: a.name,
          role: a.role,
          description: a.description,
          system_prompt: a.systemPrompt,
          allowed_tools: JSON.stringify(a.allowedTools),
          forbidden_tools: JSON.stringify(a.forbiddenTools),
          model_policy: JSON.stringify({ tier: a.modelTier }),
          max_iterations: a.maxIterations,
          timeout_ms: a.timeoutMs,
          budget_usd: a.budgetUsd,
          skills: JSON.stringify(a.skills ?? []),
          status: "idle",
          created_at: now,
          updated_at: now,
        });
        n++;
      }
    });
    return n;
  }

  list(orgId: string): Row[] {
    return this.db.all(
      "SELECT id, name, role, description, status, model_policy, max_iterations, timeout_ms, budget_usd, allowed_tools, forbidden_tools, skills, heartbeat_at FROM agents WHERE org_id = ? ORDER BY name",
      [orgId]
    );
  }

  get(orgId: string, agentId: string): Row {
    const row = this.db.get(
      "SELECT * FROM agents WHERE org_id = ? AND id = ?",
      [orgId, agentId]
    );
    if (!row) throw new AppError("NOT_FOUND", `agent ${agentId} not found`);
    return row;
  }

  heartbeat(orgId: string, agentId: string): void {
    const res = this.db.driver.run(
      "UPDATE agents SET heartbeat_at = ?, updated_at = ? WHERE org_id = ? AND id = ?",
      [this.db.now(), this.db.now(), orgId, agentId]
    );
    if (Number(res.changes) !== 1) {
      throw new AppError("NOT_FOUND", `agent ${agentId} not found`);
    }
  }

  setStatus(orgId: string, agentId: string, status: "idle" | "busy" | "paused" | "failed" | "retired"): void {
    const res = this.db.driver.run(
      "UPDATE agents SET status = ?, updated_at = ? WHERE org_id = ? AND id = ?",
      [status, this.db.now(), orgId, agentId]
    );
    if (Number(res.changes) !== 1) {
      throw new AppError("NOT_FOUND", `agent ${agentId} not found`);
    }
  }

  /** Resolve the definition contract for an agent row. */
  static parseContract(row: Row): {
    allowedTools: string[];
    forbiddenTools: string[];
    modelTier: string;
    budgetUsd: number;
    maxIterations: number;
    timeoutMs: number;
    skills: string[];
  } {
    const mp = safeJson(String(row.model_policy ?? "{}")) as { tier?: string };
    return {
      allowedTools: safeJson(String(row.allowed_tools ?? "[]")) as string[],
      forbiddenTools: safeJson(String(row.forbidden_tools ?? "[]")) as string[],
      modelTier: String(mp.tier ?? "STANDARD"),
      budgetUsd: Number(row.budget_usd ?? 5),
      maxIterations: Number(row.max_iterations ?? 25),
      timeoutMs: Number(row.timeout_ms ?? 600_000),
      skills: safeJson(String(row.skills ?? "[]")) as string[],
    };
  }
}

type Row = Record<string, unknown>;

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}
