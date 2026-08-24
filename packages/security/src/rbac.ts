/** Coarse-grained permissions enforced server-side on every route. */
export type Permission =
  // projects
  | "project:read" | "project:create" | "project:update" | "project:delete"
  | "mission:create" | "mission:update"
  | "task:create" | "task:update" | "task:dispatch"
  | "agent:read" | "agent:manage"
  | "execution:read" | "execution:control"
  | "model:read" | "model:manage" | "routing:manage"
  | "approval:request" | "approval:decide"
  | "security:read" | "security:manage"
  | "deployment:read" | "deployment:create" | "deployment:rollback"
  | "knowledge:read" | "knowledge:write"
  | "audit:read" | "audit:verify"
  | "settings:read" | "settings:write"
  | "budget:manage";

export const PERMISSIONS = [
  "project:read", "project:create", "project:update", "project:delete",
  "mission:create", "mission:update",
  "task:create", "task:update", "task:dispatch",
  "agent:read", "agent:manage",
  "execution:read", "execution:control",
  "model:read", "model:manage", "routing:manage",
  "approval:request", "approval:decide",
  "security:read", "security:manage",
  "deployment:read", "deployment:create", "deployment:rollback",
  "knowledge:read", "knowledge:write",
  "audit:read", "audit:verify",
  "settings:read", "settings:write",
  "budget:manage",
] as const;

export type Role =
  | "OWNER" | "PRINCIPAL" | "ADMIN" | "CTO" | "TECH_LEAD"
  | "ENGINEER" | "QA" | "SECURITY" | "DEVOPS" | "VIEWER" | "AUDITOR";

const READ_ONLY: Permission[] = [
  "project:read", "agent:read", "execution:read", "model:read",
  "security:read", "deployment:read", "knowledge:read",
  "audit:read", "settings:read",
];

const ENGINEERING: Permission[] = [
  ...READ_ONLY,
  "task:create", "task:update", "mission:update",
  "knowledge:write", "execution:control", "approval:request",
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set([...PERMISSIONS]),
  PRINCIPAL: new Set<Permission>([...PERMISSIONS].filter((p) => p !== "settings:write")),
  ADMIN: new Set<Permission>([
    ...ENGINEERING,
    "project:create", "project:update", "project:delete",
    "mission:create", "agent:manage", "model:manage", "routing:manage",
    "security:manage", "settings:write", "budget:manage",
    "audit:verify",
  ]),
  CTO: new Set<Permission>([
    ...ENGINEERING,
    "project:update", "mission:create", "agent:manage", "routing:manage",
    "deployment:create", "deployment:rollback", "security:manage", "approval:decide",
  ]),
  TECH_LEAD: new Set<Permission>([
    ...ENGINEERING,
    "task:dispatch", "deployment:create", "approval:decide", "routing:manage",
  ]),
  ENGINEER: new Set(ENGINEERING),
  QA: new Set<Permission>([...READ_ONLY, "task:update", "approval:request", "knowledge:write"]),
  SECURITY: new Set<Permission>([
    ...READ_ONLY,
    "security:manage", "approval:request", "knowledge:write",
    "deployment:rollback",
  ]),
  DEVOPS: new Set<Permission>([
    ...READ_ONLY,
    "deployment:create", "deployment:rollback", "task:dispatch",
    "approval:request", "knowledge:write",
  ]),
  VIEWER: new Set(READ_ONLY),
  AUDITOR: new Set<Permission>([...READ_ONLY, "audit:verify"]),
};

const SENSITIVE_ACTIONS: Record<string, { permission: Permission; risk: "medium" | "high" | "critical" }> = {
  "deploy:production": { permission: "deployment:create", risk: "critical" },
  "deploy:staging": { permission: "deployment:create", risk: "medium" },
  "deployment:rollback": { permission: "deployment:rollback", risk: "high" },
  "project:delete": { permission: "project:delete", risk: "critical" },
  "secrets:rotate": { permission: "settings:write", risk: "critical" },
  "security-gate:modify": { permission: "security:manage", risk: "high" },
  "model-policy:change": { permission: "routing:manage", risk: "high" },
  "destructive-tool:approve": { permission: "approval:decide", risk: "critical" },
  "release:merge": { permission: "approval:decide", risk: "high" },
};

export function permissionsFor(role: Role): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Map a sensitive action to its required permission + approval risk.
 * Returns undefined for unknown actions (callers must deny).
 */
export function sensitiveAction(action: string):
  | { permission: Permission; risk: "medium" | "high" | "critical" }
  | undefined {
  return SENSITIVE_ACTIONS[action];
}
