# SKILLS

Skills are reusable procedure definitions attached to agents and workflows.
The registry schema (master prompt §21):

```ts
interface Skill {
  name: string;
  version: string;
  description: string;
  inputs: Record<string, unknown>;   // JSON schema
  outputs: Record<string, unknown>;
  preconditions: string[];
  procedure: string[];               // ordered steps
  verification: string;              // how to prove success
  failureHandling: string;
  requiredTools: string[];
  requiredPermissions: string[];
}
```

## Seeded lifecycle categories

| Category | Example skills | Owning agents |
|---|---|---|
| discovery | grill-with-docs, context-interview | requirements-engineer, principal |
| requirements | srs-authoring, acceptance-criteria, edge-case-sweep | product-manager |
| architecture | c4-diagram, adr-writing, threat-model-stride | architect, security-engineer |
| planning | wayfinder-decomposition, tracer-bullets | captain, tech-lead* |
| implementation | tdd-red-green-refactor, deep-module-design | backend/frontend/staff engineer |
| testing | coverage-gate-80-60, e2e-playwright, k6-load | qa-engineer, performance-engineer |
| debugging | systematic-debugging, regression-pinning | staff-engineer |
| security | owasp-api-top10-check, secrets-hygiene | security-engineer |
| deployment | blue-green-switch, canary-analysis | devops-engineer, release-manager |
| observability | slo-definition, error-budget-policy | sre |
| documentation | diataxis-map, runbook-authoring | documentation-engineer |
| research | cited-research (source/date/confidence) | research-agent |
| finance | budget-review, cost-anomaly-triage | finops-agent |

`tech-lead` maps to the CTO/TECH_LEAD human role in RBAC; the captain agent
fulfills the machine-side planning duties.

## Registering skills

Skills are data, not code. Store definitions as YAML under `workflows/skills/`
and they are validated at boot by `packages/skills` (strict mode validates the
schema contract; control plane mounts permissively at runtime and logs issues
via `SkillRegistry`). Eight skills ship today:

`tdd-red-green-refactor` · `threat-model-stride` · `srs-authoring` ·
`acceptance-criteria` · `coverage-gate-80-60` · `adr-writing` · `diataxis-map` ·
`cited-research`

Available over the API:

- `GET /api/v1/skills` — all registered skills (name/version/description)
- `GET /api/v1/skills/:name` — full definition including `procedure`,
  `verification`, `requiredTools`, `requiredPermissions`
- Agent contracts declare `skills: string[]` by name; permission checks always
  resolve through the tool risk matrix regardless of skill claims.

New skills: author `workflows/skills/<name>.yaml` (mind YAML quoting — quote
step text containing `: `), add a unit test in `packages/skills/test/`, and
reference the skill name from the owning agent contract in
`packages/orchestration/src/agents.ts`.
