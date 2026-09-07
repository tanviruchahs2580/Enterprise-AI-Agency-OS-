# Environments v1.0 — 12-Factor + Vault

| | |
|---|---|
| **Document** | `docs/infra/environments.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | DevOps (devops-engineer), **Accountable: SRE** |

## 1. Envs

| Env | Purpose | DB | URL | Parity to prod |
|---|---|---|---|---|
| **local** | `docker compose up` (SQLite) | `data/agencyos.sqlite` | `http://localhost:3000` | 90% (process sandbox) |
| **dev** | Ephemeral PR env | Postgres (Docker) | `https://dev.agency.local` | 95% |
| **staging** | **Prod parity** — blue-green target | Postgres + non-root images | `https://staging.agency.local` | **100%** |
| **prod** | Live | Postgres HA, encrypted state | `https://agency.local` | — |

## 2. 12-Factor config (never in repo, never in logs)

- **Source:** `packages/core/src/config.ts` — env vars only; `business.local.json` gitignored.
- **Required:** `AGENCY_OS_VERSION`, `DATABASE_URL` (prod), `MODEL_PROVIDER_API_KEY` (real LLM), `OTEL_EXPORTER_OTLP_ENDPOINT` (optional).
- **Flag:** `FEATURE_AGENT_SPECIALISTS` (now local redesign → default on at G1).

## 3. Secrets — vault, not repo

- **Vault:** HashiCorp Vault (or AWS Secrets Manager) — `secrets.read/rotate` (`TOOL_RISK: critical`) via RBAC `settings:write`.
- **Hard rules:** `gitleaks` in CI (`security.yml`), `.env` + `*.sqlite` ignored, no secret in `knowledge_documents` or logs (P1 Hard Rule 3).

## 4. Change log

- v1.0 — initial 4-env + 12-factor + vault
