# Strategy & Scope

Status: **Live** (v0.10.0) · Owner: principal · Series: audit Phase 4

## Vision

An **enterprise AI agency operating system**: every project is staffed by a
roster of contract-bound AI agents that plan, build, verify, deploy, and
account for their work under the same governance — identity, separation of
duties, approvals, budgets, audit, and SLOs — that an enterprise applies to
human engineers.

The product is not "chat on top of a repo". It is a **control plane** with:

- contract-defined agents (`roster` → `agents`)
- decomposition → dispatch → execution → review → handoff pipelines
- tool-risk enforcement + human-in-the-loop approvals
- tamper-evident, hash-chained audit (ADR-0010)
- per-org budgets, keys, and tenant isolation
- model/tier routing, skills (incl. per-org overrides + feedback), workflows
- optional A2A exchange, at-rest encryption, OIDC/SSO, tracing, migration-safe DB

## Scope — in

- **Governance layer**: RBAC, approvals, audit, budgets, escape hatches.
- **Delivery layer**: mission/task lifecycle, worktree patching, TDD loops,
  deterministic + e2e verification, release/rollback planning.
- **Ops layer**: staging deploys, SLO stubs, runbooks, DR, backup/restore,
  Kubernetes chart + vault/KMS key resolution + OTel tracing.
- **Compliance artifacts**: SOC-2-style controls mapping, risk register,
  dependency/security audit, coverage and mutation gates.
- **Interop seams**: A2A TaskCards (`FEATURE_A2A`), webhooks, CLI/API v1.

## Scope — out (explicit non-goals)

- Consumer chat apps, no-code builders, or horizontal "AI agent marketplace".
- Autonomous **production** deploys: any `deploy.production` requires human
  approval (permission layer, not prompt). Staging-only autonomy is the ceiling.
- Blind autonomy: `FEATURE_A2A`, experts, and vector knowledge are behind
  explicit feature flags and default-off.
- Self-modification of the governance layer: RBAC/approval/settings changes
  are audited and require `settings:write`/`security:manage`/`approval:decide`.
- Real-model validation, paid pentest, SOC 2 attestation, and second human
  reviewer are **external** items (see `docs/KNOWN-LIMITATIONS.md`).
- Multi-region active-active and SOC 2 type II evidence — future.

## Product model

Per-org tenancy; per-agent contracts (allowed/forbidden tools, tier,
iteration cap, timeout, budget). Execution persists a `handoff` knowledge
document: requested → produced → remaining → tests → risks → next step,
with facts/assumptions tagged (`knowledge_documents.kind`).

## Delivery & operations model

| Concern | Mechanism |
|---|---|
| Identity | API keys, optional OIDC/SSO (mocked IdP, `FEATURE_OIDC`) |
| AuthZ | RBAC per role; org-scoped ownership |
| Tool risk | Risk matrix; high/critical actions route through approval service |
| Money | Risk-weighted per-tier budget caps; breaches escalate same day |
| Evidence | Hash-chained audit + verification matrix + traceability matrix |
| Reliability | SLO stubs per service; error budgets; rollback plans |
| Security | Vault/KMS key resolution, at-rest envelope encryption (opt-in), secrets rotation stubs |
| Performance | `npm run bench` JSON baseline in `bench/results.json` |

## Phase gates

Completed in-tree as the enterprise upgrade batch (see
`docs/ENTERPRISE_UPGRADE_ROADMAP.md` for the audited phase plan):

- **Phase 1** — governance, autonomy, assurance: RBAC + approvals + DoR/
  standards gates (`.opencode/AGENTS.md`), code review + adversarial review,
  security gates, OIDC/SSO, multi-agent fan-out.
- **Phase 2** — isolation & hardening: tenant-isolated org keys + at-rest
  encryption (`ENCRYPT_AT_REST`), data minimization / separation of duties,
  per-org budget enforcement v2.
- **Phase 3** — operations: SLOs+runbooks+rollback/DR, staging deploys,
  K8s (+Vault/KMS) chart, OTel tracing, failure injection.
- **Phase 4** — intelligence & external: skills overrides + feedback loops,
  A2A TaskCards, benchmarks scaffold, strategy/scope (this doc).

## Runbooks

`docs/OPERATIONS-RUNBOOK.md` · `docs/INCIDENT-RESPONSE.md` ·
`docs/ROLLBACK-RUNBOOK.md` · `docs/DISASTER-RECOVERY.md` ·
`docs/SECURITY-RUNBOOK.md` · `docs/KUBERNETES.md` · `docs/DEPLOYMENT-RUNBOOK.md`

## Decision rights

- Scope additions require an ADR + sign-off by principal; production-affecting
  changes require approval + audit trail.
- This document is the source of truth for what the agency is and is not
  allowed to do autonomously.