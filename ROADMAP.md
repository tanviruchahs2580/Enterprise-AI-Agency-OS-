# ROADMAP

## v0.1 — Foundation (this release)

- Control plane API with RBAC, approvals, audit chain, budgets, SSE
- 21-agent registry, task graph, state machine, job queue, workflow engine
- Model router (mock + OpenAI-compatible), circuit breakers, cost ledger
- Dashboard console, MCP server for coding agents
- CI/CD, SBOM, secret scanning, Dependabot
- Docker compose (postgres + observability profiles)

## v0.2 — Execution depth

- Real code-editing execution loop: git worktree per task, PR creation via
  GitHub adapter, two-axis review agents posting findings to the review tables
- Skill loader for `workflows/skills/*.yaml` registry files
- Prometheus `/metrics` endpoint (prom-client) + Grafana dashboards-as-code
- PostgreSQL driver implementation (`pg`) behind the existing interface
- `downgrade` budget action routing to cheaper tier automatically
- Helm chart

## v0.3 — Enterprise surface

- OIDC/OAuth2 identity provider adapter (ADR-0007 seam)
- Outbound webhook delivery UI + DLQ replay controls
- Vector knowledge retrieval behind `FEATURE_VECTOR_KNOWLEDGE` (pgvector or
  pluggable store)
- Browser automation provider (Playwright) behind feature flag
- Multi-workspace tenancy hardening + per-workspace encryption keys

## v1.0 — Agency at scale

- A2A protocol endpoint (flagged) for inter-agency dispatch
- Chaos testing harness for the platform itself
- SLO burn-rate alerting wired to notification channels
- Mutation testing gate in quality receipts
