# Records of Processing (RoPA)

Catalog of personal data processed by an Enterprise AI Agency OS deployment.
Row entries are the deployment's responsibility — update regions/retention to
match the operator's actual configuration. Audit Phase 4 documentation item.

## Categories

| # | Data category | Purpose / lawful basis | Source | Recipients | Region (default) | Retention |
|---|---|---|---|---|---|---|
| 1 | Account/API-key identifiers | Platform access & RBAC (performance of contract) | Operator/tenant | Control plane only | Deployment DB region | K 7 d after revocation (key hashes) |
| 2 | Task/intent content | Agent execution (performance of contract) | Tenant submissions | Model provider (sub-processor) | Deployment + provider region | Per retention policy (see below) |
| 3 | Ingested source content | Research/cited evidence (legitimate interest) | Research agents | Model provider | Deployment + provider region | Per retention policy |
| 4 | Audit events | Security & accountability (legal obligation) | Platform | Control plane only | Deployment DB region | Hash-chained, tamper-evident; immutable |
| 5 | Session metadata | Auth/session mgmt (legitimate interest) | End user | Control plane only | Deployment DB region | Per `SESSION_TTL_MS` |
| 6 | Notification records | Operational notifications (contract) | Platform | Operator mail/webhook | Deployment | Per retention policy |

## Purposes

Agent task execution, quality/review gates, cost governance, security auditing,
support triage. No data is sold. There is no ad/marketing use.

## Retention policy

- Task payloads & knowledge docs: configurable (default 90 days) via `OPERATIONS.md`.
- Audit chain: retained for the full data lifecycle (immutable append-only).
- Session rows: TTL (default 24 h) + sweeper.
- Backups: <dump interval / age> — document at deploy time.

## DPIAs

DPIA required when: processing on a large scale reveals sensitive data, or
agent prompts may contain special-category data. Trigger a DPIA before feeding
such data to the pipeline; model providers are documented sub-processors.

## Erasure

GDPR erasure is soft-delete (`deleted_at`) + documented erasure runbook
(`OPERATIONS.md`) for PostgreSQL/SQLite respectively.