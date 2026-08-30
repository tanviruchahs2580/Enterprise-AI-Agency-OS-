import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { AppError } from "@agency/core";
import type { Skill } from "./types.ts";

export interface SkillIssue {
  file: string;
  errors: string[];
}

export interface SkillRegistryOptions {
  /** Directory containing `*.yaml` skill definitions. */
  dir?: string;
  /**
   * `strict` throws on the first invalid file; `permissive` skips invalid
   * files and records issues. Servers use permissive (boot resilience); tests
   * use strict to prove every shipped skill is valid.
   */
  mode?: "strict" | "permissive";
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Validate a parsed skill definition against the registry schema. */
export function validateSkill(raw: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(raw)) return ["skill must be a YAML object"];

  const s = raw as Partial<Skill>;

  if (!isNonEmptyString(s.name)) errors.push("name: non-empty string required");
  else if (!NAME_RE.test(s.name!)) errors.push(`name: '${s.name}' must match /^[a-z0-9][a-z0-9-]+$/`);

  if (!isNonEmptyString(s.version)) errors.push("version: non-empty string required");
  if (!isNonEmptyString(s.description)) errors.push("description: non-empty string required");
  if (!isObj(s.inputs)) errors.push("inputs: object required");
  if (!isObj(s.outputs)) errors.push("outputs: object required");
  if (!isStringArray(s.preconditions)) errors.push("preconditions: array of strings required");
  if (!Array.isArray(s.procedure) || s.procedure.length === 0 || !s.procedure.every((x) => typeof x === "string"))
    errors.push("procedure: non-empty array of strings required");
  if (!isNonEmptyString(s.verification)) errors.push("verification: non-empty string required");
  if (!isNonEmptyString(s.failureHandling)) errors.push("failureHandling: non-empty string required");
  if (!isStringArray(s.requiredTools) || s.requiredTools!.length === 0)
    errors.push("requiredTools: non-empty array of strings required");
  if (!isStringArray(s.requiredPermissions)) errors.push("requiredPermissions: array of strings required");
  return errors;
}

/**
 * Loads and validates skill definitions from `workflows/skills`
 * (SKILLS.md: definitions are data, versionable, and reviewable).
 */
export class SkillRegistry {
  private skills = new Map<string, Skill>();
  readonly issues: SkillIssue[] = [];
  private opts: SkillRegistryOptions;

  constructor(opts: SkillRegistryOptions = {}) {
    this.opts = opts;
  }

  dir(): string {
    return this.opts.dir ?? join(process.cwd(), "workflows", "skills");
  }

  /** Reads, validates, and indexes all skill files in the registry directory. */
  load(): this {
    const dir = this.dir();
    if (!existsSync(dir)) {
      this.modeError(`skills directory not found: ${dir}`);
      return this;
    }
    const files = readdirSync(dir).filter((f) => /\.(ya?ml)$/i.test(f)).sort();
    for (const file of files) {
      const path = join(dir, file);
      let raw: unknown;
      try {
        raw = parse(readFileSync(path, "utf8"));
      } catch (e) {
        this.recordIssue(file, [`unparseable YAML: ${String(e)}`]);
        continue;
      }
      const errors = validateSkill(raw);
      if (errors.length > 0) {
        this.recordIssue(file, errors);
        continue;
      }
      const skill = raw as Skill;
      if (this.skills.has(skill.name)) {
        this.recordIssue(file, [`duplicate skill name '${skill.name}'`]);
        continue;
      }
      this.skills.set(skill.name, skill);
    }
    return this;
  }

  list(): Skill[] {
    return [...this.skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): Skill {
    const s = this.skills.get(name);
    if (!s) throw new AppError("NOT_FOUND", `skill '${name}' not registered`);
    return s;
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  count(): number {
    return this.skills.size;
  }

  private recordIssue(file: string, errors: string[]): void {
    this.issues.push({ file, errors });
    if (this.opts.mode === "strict") {
      throw new AppError("VALIDATION_ERROR", `skill ${file} invalid: ${errors.join("; ")}`, {
        details: { file, errors },
      });
    }
  }

  private modeError(message: string): void {
    if (this.opts.mode === "strict") throw new AppError("VALIDATION_ERROR", message);
    this.issues.push({ file: "<registry>", errors: [message] });
  }
}