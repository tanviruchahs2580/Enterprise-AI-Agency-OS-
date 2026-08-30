import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "@agency/core";
import type { WorkflowEngine, WorkflowDefinition } from "./workflow.ts";

export interface WorkflowTemplateIssue {
  file: string;
  errors: string[];
}

export interface WorkflowTemplateRegistryOptions {
  /** Directory containing `workflows/*.yaml` template definitions (not skills/). */
  dir?: string;
  mode?: "strict" | "permissive";
}

/**
 * Loads workflow templates from `workflows/*.yaml` (audit Phase 2.2: repeatable
 * path templates alongside the canonical enterprise-feature definition).
 * Templates are data: validated via WorkflowEngine.parseDefinition, versionable
 * in git, and immediately dispatchable through the API.
 */
export class WorkflowTemplateRegistry {
  private templates = new Map<string, WorkflowDefinition>();
  readonly issues: WorkflowTemplateIssue[] = [];
  private engine: WorkflowEngine;
  private opts: WorkflowTemplateRegistryOptions;

  constructor(engine: WorkflowEngine, opts: WorkflowTemplateRegistryOptions = {}) {
    this.engine = engine;
    this.opts = opts;
  }

  dir(): string {
    return this.opts.dir ?? join(process.cwd(), "workflows");
  }

  load(): this {
    const dir = this.dir();
    if (!existsSync(dir)) {
      const errors = [`workflows directory not found: ${dir}`];
      if (this.opts.mode === "strict") throw new AppError("VALIDATION_ERROR", errors[0]!);
      this.issues.push({ file: "<registry>", errors });
      return this;
    }
    const files = readdirSync(dir).filter((f) => /\.(ya?ml)$/i.test(f)).sort();
    for (const file of files) {
      try {
        const defn = this.engine.parseDefinition(readFileSync(join(dir, file), "utf8"));
        if (this.templates.has(defn.name)) {
          throw new AppError("VALIDATION_ERROR", `duplicate workflow template '${defn.name}'`);
        }
        this.templates.set(defn.name, defn);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        this.issues.push({ file, errors: [err.message] });
        if (this.opts.mode === "strict") throw err;
      }
    }
    return this;
  }

  list(): WorkflowDefinition[] {
    return [...this.templates.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): WorkflowDefinition {
    const t = this.templates.get(name);
    if (!t) throw new AppError("NOT_FOUND", `workflow template '${name}' not registered`);
    return t;
  }

  has(name: string): boolean {
    return this.templates.has(name);
  }

  count(): number {
    return this.templates.size;
  }
}