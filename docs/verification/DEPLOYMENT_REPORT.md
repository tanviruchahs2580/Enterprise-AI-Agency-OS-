# Deployment Report — Enterprise AI Agency OS

## Images (verified, prior turn)
- `Dockerfile.control-plane`: builds successfully; runs as non-root `agency`; health
  and readiness wired; no secret leaked in image or logs.
- `Dockerfile.dashboard`: present (Vite SPA).

## Orchestration
- `docker-compose.yml` with profiles: default (sqlite), `postgres`, `observability`.
- Hardened: `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges: true`,
  resource limits, healthchecks. Requires `ADMIN_BOOTSTRAP_KEY`, `POSTGRES_PASSWORD`,
  `GRAFANA_PASSWORD` (compose enforces all `:?` vars for any command).

## Database deployment
- Dev: SQLite (WAL). Prod: `DATABASE_URL` MUST be `postgres://` (config validates this
  and refuses `:memory:`/sqlite in production).
- Migration: `scripts/migrate.mjs` is idempotent (applied 6 migrations in clean clone).

## CI/CD (verified by inspection)
- `.github/workflows/ci.yml`: lint → typecheck → test → build → self-test.
- `docker.yml`: build + Trivy scan. `security.yml`: gitleaks + SBOM. `release.yml`: tag/release.
- v0.14.0 added a Playwright e2e CI gate + CODEOWNERS.

## Clean deployment test (§58 / §64, this session)
- Fresh clone → `npm ci` → migrate → build → boot → real task **succeeded**.
- Postgres compose rehearsal (prior turn): stop/restart preserved data.

## Not performed (no authorization / environment)
- Push to `origin/main` and live GitHub Actions run — withheld per release gate policy.
- Kubernetes deploy — not part of this product's stated target (compose/Docker sufficient).

## Verdict
Deployable to Docker / Docker Compose today. Production posture (non-root, hardened,
Postgres-backed, scanned) is sound. Recommend wiring the `observability` profile
(Grafana) and a real secret backend before GA.
