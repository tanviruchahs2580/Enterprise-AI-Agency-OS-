export interface WorkGraphNode {
  id: string;
  dependsOn?: string[];
  /** Named condition — resolved by the `conditions` map at execution time. */
  condition?: string;
}

export interface WorkGraphCompiled {
  /** Topological levels; nodes within a level run concurrently. */
  levels: string[][];
  /** Cyclic chains (each an ordered list that loops). Empty when acyclic. */
  cycles: string[][];
  /** Dependency ids that reference a node that does not exist. */
  missingDependencies: { node: string; missing: string[] }[];
}

export interface WorkGraphResult {
  id: string;
  status: "completed" | "skipped" | "blocked";
  output?: Record<string, unknown>;
  reason?: string;
}

export interface WorkGraphExecution {
  nodes: WorkGraphNode[];
  handlers: {
    run(id: string, ctx: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  conditions?: Record<string, (ctx: Record<string, unknown>) => boolean>;
  initialContext?: Record<string, unknown>;
}

/**
 * Deterministic DAG work-graph engine (master prompt §5 — the agency runs on a
 * work graph, not a fixed pipeline). Compilation does cycle + dangling-dep
 * detection; execution walks topological levels, running independent nodes in
 * parallel, skipping conditioned nodes, and blocking dependents of failed
 * nodes without tumbling the whole graph.
 */
export class WorkGraph {
  compile(nodes: WorkGraphNode[]): WorkGraphCompiled {
    const ids = new Set(nodes.map((n) => n.id));
    const missing: { node: string; missing: string[] }[] = [];
    for (const n of nodes) {
      const m = (n.dependsOn ?? []).filter((d) => !ids.has(d));
      if (m.length > 0) missing.push({ node: n.id, missing: m });
    }

    const cycles = findCycles(nodes);

    // Kahn's algorithm for topological levels (parallel batches).
    const indeg = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const n of nodes) {
      indeg.set(n.id, (n.dependsOn ?? []).length);
      for (const d of n.dependsOn ?? []) {
        const list = dependents.get(d) ?? [];
        list.push(n.id);
        dependents.set(d, list);
      }
    }
    const levels: string[][] = [];
    const queue = nodes.filter((n) => (n.dependsOn ?? []).length === 0).map((n) => n.id);
    while (queue.length > 0) {
      const batch: string[] = [];
      const next: string[] = [];
      for (const id of queue) {
        batch.push(id);
        for (const child of dependents.get(id) ?? []) {
          indeg.set(child, indeg.get(child)! - 1);
          if (indeg.get(child) === 0) next.push(child);
        }
      }
      // stable within-batch ordering (roster order) — deterministic
      batch.sort((a, b) => nodes.findIndex((n) => n.id === a) - nodes.findIndex((n) => n.id === b));
      levels.push(batch);
      queue.length = 0;
      queue.push(...next);
    }
    const visitable = levels.flat();
    if (visitable.length !== ids.size && cycles.length === 0) {
      // unreachable nodes without a detected cycle — still a DAG violation
      const stranded = nodes.filter((n) => !visitable.includes(n.id)).map((n) => n.id);
      levels.push(stranded);
    }

    return { levels, cycles, missingDependencies: missing };
  }

  async execute(exec: WorkGraphExecution): Promise<{
    results: WorkGraphResult[];
    context: Record<string, unknown>;
    snapshot: Record<string, unknown>;
  }> {
    const compiled = this.compile(exec.nodes);
    const context: Record<string, unknown> = { ...(exec.initialContext ?? {}) };
    const results: WorkGraphResult[] = [];
    const blockedNodes = new Set<string>();
    const skippedNodes = new Set<string>();

    for (const level of compiled.levels) {
      const work = level.map(async (id) => {
        const node = exec.nodes.find((n) => n.id === id)!;
        const deps = node.dependsOn ?? [];
        const depBlocked = deps.some((d) => blockedNodes.has(d));
        const depSkipped = deps.some((d) => skippedNodes.has(d));
        if (depBlocked) {
          blockedNodes.add(id);
          return { id, status: "blocked" as const, reason: "dependency failed or blocked" };
        }
        if (node.condition && exec.conditions?.[node.condition]?.(context) === false) {
          return { id, status: "skipped" as const, reason: `condition '${node.condition}' not met` };
        }
        if (depSkipped) {
          skippedNodes.add(id);
          return { id, status: "skipped" as const, reason: "dependency skipped under condition" };
        }
        try {
          const output = await exec.handlers.run(id, context);
          context[id] = output ?? {};
          return { id, status: "completed" as const, output };
        } catch (e) {
          blockedNodes.add(id);
          return {
            id,
            status: "blocked" as const,
            reason: `handler raised: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      });
      const settled = await Promise.all(work);
      for (const r of settled) {
        if (r.status === "skipped") skippedNodes.add(r.id);
        results.push({ id: r.id, status: r.status, output: r.output, reason: r.reason });
      }
    }

    return {
      results,
      context,
      snapshot: {
        levels: compiled.levels,
        cycles: compiled.cycles,
        missingDependencies: compiled.missingDependencies,
        results,
      },
    };
  }
}

function findCycles(nodes: WorkGraphNode[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n.id, n.dependsOn ?? []);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);
  const stack: string[] = [];
  const cycles: string[][] = [];

  const dfs = (u: string): void => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (!color.has(v)) {
        // dangling dep: not part of a cycle; skip
        continue;
      }
      if (color.get(v) === GRAY) {
        const start = stack.indexOf(v);
        const chain = [...stack.slice(start), v];
        cycles.push(chain);
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) dfs(n.id);
  }
  return cycles;
}