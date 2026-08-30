# ROADMAP

Reconciled against `PROGRESS.md` (2026-08-30, Enterprise-AI-Agency-OS audit
Phase 1 punch #1). Statuses reflect the *currently shipped* line, not aspirational
titles. PROGRESS.md remains the live phase ledger; every shipped item below lands
there with evidence.

Legend: `[SHIPPED]` done in tree · `[PARTIAL]` scaffolded, needs runtime/creds ·
`[BLOCKED]` needs external decision/secret/host.

## Shipped in this release (v0.9.x + Phase-1 audit pass)

### Foundation
- `[SHIPPED]` Control plane API with RBAC, approvals, hash-chained audit, budgets, SSE
- `[SHIPPED]` 24-agent contract roster (21 original + localization-engineer,
  ux-designer, data-analytics-engineer), seeded + contract-synced on boot
- `[SHIPPED]` Task graph, state machine, job queue, resumable workflow engine
- `[SHIPPED]` Model router (mock + OpenAI-compatible), circuit breakers, cost ledger
- `[SHIPPED]` Dashboard console (cookie-first auth), MCP server, CI/CD, SBOM,
  secret scanning, Dependabot, Docker compose (postgres + observability profiles)

### Audit Phase 1 — Auth & skills (this pass)
- `[SHIPPED]` Skill loader — `workflows/skills/*.yaml` (8 skills) validated at
  boot via `packages/skills` (`SkillRegistry`, permissive/strict modes); exposed
  as `GET /api/v1/skills` & `GET /api/v1/skills/:name`; agents declare `skills[]`
  in their contracts (audit §1.1, punch #2)
- `[SHIPPED]` httpOnly SameSite=Strict session cookie — `POST/DELETE/GET
  /api/v1/auth/session`; raw API key never touches browser storage
  (`secret_store: httpOnly-cookie` in skill-governance.yaml) (audit §1.2, punch #2)

### Audit Phase 2 — Execution & governance (this pass)
- `[SHIPPED]` Workflow breadth — `hotfix`, `dependency-patch`, `research-spike`
  templates added to the engine; `lowRiskSkip` stages + `riskTier` on
  `POST /api/v1/workflows/:name/start`; `GET /api/v1/workflows[/:name]`
  (audit §2.2/2.6, punch #5)
- `[SHIPPED]` Risk-weighted budgets — per-tier cap (REASONING/SECURITY/REVIEW $8,
  STANDARD $6, FAST/VISION/LOCAL $4) (audit §2.4, punch #6)
- `[SHIPPED]` 3 new agent roles + skills wiring (audit §2.5)
- `[SHIPPED]` DoR warnings, ADR drafts, SLO stubs already wired (v0.9.1)

## Next (proposed)

### v0.10 — Enterprise auth & observability
- `[PARTIAL]` OIDC/OAuth2 identity-provider adapter (ADR-0007 seam; dashboard
  session plumbing shippable separately)
- `[BLOCKED]` Real-model provider E2E validation (needs `MODEL_PROVIDER_API_KEY`)
- `[BLOCKED]` OTel SDK export (deps)
- `[BLOCKED]` Prometheus `/metrics` (prom-client) + Grafana dashboards-as-code
- `[PARTIAL]` PostgreSQL driver (`pg`) behind existing interface — needs a
  Docker/PG-capable host for full drill

### v0.11 — Execution depth
- `[BLOCKED]` Real code-editing loop: git worktree per task + GitHub PR adapter +
  two-axis review-agent findings
- `[BLOCKED]` Helm chart + K8s manifest validation (no Docker/K8s host locally)
- `[PARTIAL]` Browser automation provider (Playwright) behind a feature flag
- `[PARTIAL]` `downgrade` budget action routing to cheaper tier

### v0.12 — Enterprise surface
- `[PARTIAL]` Vector knowledge retrieval behind `FEATURE_VECTOR_KNOWLEDGE`
- `[PARTIAL]` Multi-workspace tenancy + per-workspace encryption keys
- `[BLOCKED]` External secrets manager adapter (Vault/KMS)
- `[BLOCKED]` Outbound webhook delivery UI + DLQ replay controls

### v1.0 — Agency at scale
- `[BLOCKED]` A2A protocol endpoint (flagged) for inter-agency dispatch
- `[BLOCKED]` Mutation testing gate (Stryker) in quality receipts
- `[PARTIAL]` SLO burn-rate alerting wired to notification channels
- `[PARTIAL]` Chaos testing harness for the platform itself

## Standing obligations
- Every phase appends evidence rows to `PROGRESS.md` before it is considered done.
- External/blocked items need a user decision (secret, host, or ear-marked scope)
  before they re-enter "Next". This file is updated only with `[SHIPPED]` proof.