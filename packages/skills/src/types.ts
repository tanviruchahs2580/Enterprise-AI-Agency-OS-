/** Skill contract (SKILLS.md §registry schema). Skills are data, not code. */
export interface Skill {
  name: string;
  version: string;
  description: string;
  /** JSON schema for expected inputs. */
  inputs: Record<string, unknown>;
  /** JSON schema for produced outputs. */
  outputs: Record<string, unknown>;
  preconditions: string[];
  /** Ordered steps. */
  procedure: string[];
  /** How to prove success. */
  verification: string;
  failureHandling: string;
  requiredTools: string[];
  requiredPermissions: string[];
}