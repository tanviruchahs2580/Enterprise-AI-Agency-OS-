# Data Governance v1.0 — Migrations + Backup/DR

| | |
|---|---|
| **Document** | `docs/data/migration-playbook.md` + `backup-dr.md` |
| **Version** | v1.0 |
| **Owner** | DBA (database-engineer) + SRE |

## 1. Migrations — expand-contract (zero-downtime)

1. **Expand:** `ADD COLUMN ... NULL` (reversible, additive).
2. **Contract (next release):** backfill → `NOT NULL` + drop old column.
3. **Rule:** No `db.migrate` without approval; tested on staging prod parity.

Current: `0010_agent_workforce.sql` (routing/evidence/handoffs) — reversible.

## 2. Backup / DR

| Item | Policy |
|---|---|
| **Backup** | Daily `pg_dump` + WAL, 30d retention, encrypted at rest |
| **Restore drill** | **Monthly** — restore to ephemeral staging, verify `ready.status=ready` |
| **RTO / RPO** | 1h / 5min (per `nfr-register.md`) |
| **Prod data in lower envs** | **Never** — masked fixtures only |

## 3. Exit (G6)

Successful restore drill documented in `docs/data/drill-YYYY-MM.md`.

## Change log

- v1.0 — expand-contract + backup/DR
