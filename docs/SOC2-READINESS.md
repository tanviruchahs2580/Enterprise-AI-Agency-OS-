# SOC 2 Type II Readiness

Status: **ready to scope** (T-C of the audit remediation batch). This document is
the working mapping between the AICPA Trust Services Criteria (TSC 2025, Common
Criteria CC-series) and the controls implemented in this repository, plus the
workstreams still required before a full Type II observation period can begin.

A SOC 2 Type II report is issued by an independent auditor after a defined
observation window (normally 3–6 months). This document does **not** claim an
attestation — it is the readiness scoping artifact a vendor/assessor uses to
price and schedule an engagement.

## 1. Scope decision (draft)

| Criterion | Draft choice | Notes |
|---|---|---|
| System | Enterprise AI Agency OS control plane + agent/orchestration services (deployment operator managed) |
| Trust Services Categories | Security (mandatory); optionally Availability, Confidentiality | Privacy requires a separate assessment; GDPR posture documented in `docs/compliance/` |
| Losasticity periods | Quarterly controls (most CC), monthly for monitoring/backup | See workstream 5 |
| Entities included | In-scope orgs seeded for enterprise tenants | |

## 2. Control mapping — evidence lives in-repo

Legend: **Implemented** (code + tests), **Partial** (present, needs hardening
or evidence automation), **Gap** (missing, item in workstream list).

### CC1 — Control Environment

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CC1.1 | Board/management sets tone | Partial | `AGENTS.md` role matrix; `docs/SECURITY.md` accountable owner table; needs named security owner + policy SYSOPS-POL-01 |
| CC1.2 | Integrity & ethical values communicated | Gap | Add security/code-of-conduct policy page (external, docs/compliance) |
| CC1.5 | Accountability for internal control | Partial | `Agent` contracts (allowed/forbidden tools, budgets) in AGENTS.md; per-agent audit trail |

### CC2 — Communication & Information

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CC2.1 | Information & communication objectives | Partial | `docs/` operational runbooks, `docs/API.md`, `docs/OPERATIONS.md` |
| CC2.3 | Internal communication of security responsibilities | Partial | `docs/SECURITY-RUNBOOK.md`, `docs/INCIDENT-RESPONSE.md` |

### CC3 — Risk Assessment

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CC3.1 | Risk identified/assessed | Partial | `docs/RISK-REGISTER.md`, audit report gap register |
| CC3.2 | Risk assessed incl. vendor | Partial | Dependency scans (`docs/DEPENDENCY-AUDIT.md`, Dependabot auto-PR) |
| CC3.3 | Risk response | Partial | Mitigation sections in RISK-REGISTER; Dependabot triage in CI |

### CC4 — Monitoring Activities

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CC4.1 | Monitoring of controls | Partial | Test suites (coverage gates 80/60), CI pipelines (loaded `npm test` + `npm run lint` + `npm run typecheck`), GHA security scanner |
| CC4.2 | Evaluates deviations | Partial | Post-deploy SLO stubs (sre agent), incident response runbook |

### CC5 — Control Activities

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CC5.1 | Control environment understood | Implemented | ADRs (`docs/ARCHITECTURE-DECISIONS.md`), `docs/ARCHITECTURE.md` |
| CC5.2 | Risk-relevant controls designed | Implemented | RBAC engine + API-key scopes; `apps/control-plane/src/auth.ts`; threat-model skill (`threat-model-stride`) |
| CC5.3 | Technology controls designed/implemented | Implemented | Tool risk matrix (AGENTS.md), permission-layer enforcement (approval service for destructive tools) |

### CC6 — Logical & Physical Access

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CC6.1 | Logical access secured & restricted | Implemented | RBAC (`ADMIN/OWNER/ENGINEER/VIEWER/BUDGET` tiers), 24-agent roster, per-agent tool allow/deny in migration seed |
| CC6.2 | Users identified & authenticated | Implemented | API keys (hashed at rest, revocable, per-org) + **OIDC/SSO** (auth-code + PKCE, `apps/control-plane/src/oidc.ts`) |
| CC6.3 | Roles restricted through authorization | Implemented | Permission layer + approval routing for high/critical tools; `lowRiskSkip` risk-tier pruning |
| CC6.4 | Segregation of duties | Partial | Reviewer agents cannot commit; approval-gated deployment; missing formal user-lifecycle offboarding runbook |
| CC6.5 | Physical access | Gap | Operator-side (cloud provider IAM); document responsibility matrix |
| CC6.6 | Restriction of logical access to authorized assets | Implemented | Name-scoped API keys (`docs/API.md`), org-wide key restrictions |
| CC6.7 | Storage media / assets inventory | Partial | Deployment manifests; add asset inventory table (workstream 4) |

### CC7 — System Operations

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CC7.1 | Detection of anomalies/incidents | Partial | Audit chain (hash-chained, tamper-evident, append-only), finops budget-breach escalation same day; needs live SIEM/alerting integration |
| CC7.2 | Response to incidents | Partial | `docs/INCIDENT-RESPONSE.md`, `docs/BREACH-NOTIFICATION-SLA.md` (72 h GDPR SLA) |
| CC7.3 | Incident communication | Partial | Same artifacts as 7.2; notification records in RoPA |
| CC7.4 | Incident remediation & root cause | Partial | Runbook + post-deploy SLO stubs; formal RCAs not yet templated |

### CC8 — Change Management

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CC8.1 | Change integrity maintained | Implemented | Workflow engine checkpoint/resume (`workflow_runs`), code-review + adversarial-review gates, migrations reversible-only (database-engineer), deployment approval action `deploy:staging` |
| CC8.2 | Change validated v. objectives | Implemented | TDD skills (`tdd-red-green-refactor`), coverage gates 80/60, 136+ tests, PR triage in CI |
| CC8.3 | Changes communicated/tracked | Partial | `CHANGELOG` + SemVer policy; tracing (OTel) and release checklist present |

### CC9 — Risk Mitigation

| # | Criterion | Status | Evidence |
|---|---|---|---|
| CC9.1 | Risk mitigation design | Implemented | `docs/RISK-REGISTER.md`, security-agent finding triage, threat-model skill wired into ADR workflow |

### Related Criteria, if scope includes Availability/Confidentiality

| # | Criterion | Status | Evidence |
|---|---|---|---|
| A1.1 | Availability objectives | Partial | SRE skill, error-budget stubs, DR `docs/DISASTER-RECOVERY.md`; no published availability SLA yet |
| A1.2 | Capacity tested/planned | Gap | Load/benchmark scaffold (T-M) is the seed |
| C1.1 | Confidentiality objectives | Implemented | Envelope encryption-at-rest (`ENCRYPT_AT_REST`, AES-256-GCM per-collection data keys), per-workspace org keys, at-rest + in-transit (TLS) |

## 3. Key implemented controls (in-repo evidence)

- **Audit integrity** — hash-chained tamper-evident append-only audit events.
- **Authentication** — API-key authentication with hashed secrets + full OIDC/SSO (PKCE, JWKS signature verification, single-use state).
- **Authorization** — typed RBAC + tool risk matrix (destructive/high-risk → approval service) + name-scoped keys.
- **Change control** — reversible migrations, review gates, approval-gated deploys, workflow checkpointing.
- **Data protection** — envelope encryption-at-rest, DPA template, RoPA, breach SLA.
- **Quality gates** — coverage ≥ 80% (core), ≥ 60% (apps), lint, typecheck, mutation-testing (P4.3, T-G) entering CI.

## 4. Externally required workstreams (operator/paid)

1. **Engagement**: select AICPA-accredited firm; define in-scope system boundary + observation window (3–6 months).
2. **Independent pentest** (paid, scheduled before the observation window) — no self-issued certification.
3. **Formal policies**: security policy, acceptable use, user lifecycle/offboarding, vendor due-diligence for model providers (each is a documented sub-processor).
4. **Asset inventory + capacity plan**; document physical/cloud IAM responsibility split.
5. **Evidence automation**: CI-produced control-evidence reports (audit chain export, session/backup logs, exception registers) on a quarterly cadence.
6. **DR & availability**: published SLAs, annual DR drill, backup-restore test log.
7. **Regions/DPIA**: align RoPA rows with real regions; run DPIA before special-category data ingestion.

## 5. Quarterly readiness checkpoint

After the batch ships (T-A…T-N): update this document's Status column off
`docs/FINAL-AUDIT-REMEDIATION.md`, re-run the evidence scan, and record
exceptions in the operator-controlled register.