# Gap Analysis — Enterprise AI Agency OS

Scope note: the master prompt enumerates scraping-agent capabilities (crawler,
browser engine, OCR, sitemap/RSS, SSRF-to-metadata, scraped-page prompt injection).
Those are **out of scope for this product** (an autonomous agent control plane) and
are NOT gaps — implementing them here would be wrong. The analysis below covers the
product's *actual* architecture and what is genuinely missing or weak.

## Already present & verified (no gap)
API-key auth, RBAC (11 roles), org/API-key lifecycle, task state machine, executions
+ model router (circuit breaker/fallback/budget), job queue (idempotent/retry/DLQ/
restart-recovery), audit log (hash-chained), rate limiting (429+Retry-After),
delivery worker (quality gates, re-delivery convergence), approvals (single-use/
expiry), knowledge provenance, search, Prometheus metrics, health/readiness,
hardened Docker (non-root), compose (postgres/observability), CI (lint/type/test/
build/docker/Trivy/gitleaks/SBOM), clean-clone run.

## Genuine gaps / weaknesses (prioritized)
1. **Human auth (SSO/MFA/sessions).** Only API keys exist; `users` table has no
   login. ADR-0007 already defines an `IdentityProvider` seam. *Priority: high.*
2. **Autonomous delivery loop needs real wiring.** `deliver_task` requires
   `MODEL_PROVIDER_API_KEY` + a sandbox (docker) + git backend to actually merge PRs.
   Today it is exercised via the deterministic mock. *Priority: high (for "autonomous delivery").*
3. **Distributed tracing + Grafana.** Metrics/logs/audit exist; no Otel traces;
   the `observability` compose profile is unused. *Priority: medium.*
4. **Multi-tenant row-level security.** Single-org scaffold; no Postgres RLS.
   *Priority: medium (enterprise multi-tenant).*
5. **Browser/Dashboard e2e.** Playwright is a devDep and v0.14.0 added a CI gate,
   but browsers may be absent in this env; not executed here. *Priority: medium.*
6. **Version drift.** `package.json` is `0.10.0` while git tags are `v0.14.0`/`v0.15.0`.
   Adopt release-please/changesets. *Priority: low.*
7. **i18n (Bangla + English).** Dashboard is English-only. *Priority: low.*

## Defects found & REMEDIATED this session
- **D1 (CI-blocking):** committed `v0.15.0` failed `tsc` — `ctx.db.close()` where
  `Db` had no `close()`. Fixed by adding `Db.close()` delegating to the driver.
  Re-verified: `tsc` clean.
- **H1 (durability hardening):** `SqliteDriver.close()` now issues
  `PRAGMA wal_checkpoint(TRUNCATE)` so committed frames are folded into the main
  file before handle release (proven durable via create/insert/checkpoint/close/reopen).
- **H2 (graceful shutdown):** `server.ts` `shutdown()` now closes `ctx.db` before exit.

## Intentional non-goals (do NOT add)
Web scraping, headless browser fleet, OCR pipeline, sitemap discovery — these belong
to a different product and would violate the documented architecture.
