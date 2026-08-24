# DEPLOYMENT RUNBOOK

## Prerequisites (production host)

- Node.js ≥ 24 (`.nvmrc` pins 24) OR Docker 24+ for containerized deploy
- PostgreSQL 14+ reachable (production profile REQUIRES it — boot fails fast otherwise)
- TLS termination in front (nginx/ALB/Cloudflare)

## Environment variables (all config is env-driven)

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` enables fail-fast gates |
| `ADMIN_BOOTSTRAP_KEY` | yes (prod) | 32+ random bytes; owner API key at first boot |
| `DATABASE_URL` | yes | `postgres://user:pass@host:5432/db` |
| `HOST`, `PORT` | no | default 127.0.0.1:3000; use 0.0.0.0 behind proxy |
| `CORS_ORIGIN` | yes (prod) | explicit origins, comma-separated |
| `SANDBOX_PROVIDER` | prod: `docker` | process provider refused in production |
| `MODEL_PROVIDER_API_KEY/BASE_URL/MODEL` | optional | any OpenAI-compatible endpoint |
| `DEFAULT_DAILY_BUDGET_USD` | optional | default daily org budget |

Full list with defaults: `.env.example`.

## Deploy — Docker Compose (recommended)

```sh
git clone https://github.com/tanviruchahs2580/Enterprise-AI-Agency-OS-.git
cd Enterprise-AI-Agency-OS-
cp .env.example .env          # fill ADMIN_BOOTSTRAP_KEY, POSTGRES_PASSWORD, GRAFANA_PASSWORD
docker compose --profile postgres --profile observability up -d --build

# verify
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:3000/ready
curl -fsS http://localhost:8080/            # dashboard
curl -fsS http://localhost:3000/metrics     # prometheus scrape target
```

## Deploy — bare Node + managed Postgres

```sh
npm ci --omit=dev
export NODE_ENV=production ADMIN_BOOTSTRAP_KEY=… DATABASE_URL=postgres://… CORS_ORIGIN=https://console.example.com SANDBOX_PROVIDER=docker
node scripts/migrate.mjs       # apply schema (idempotent, checksummed)
node apps/control-plane/src/server.ts
```

Run under systemd/supervisor. Workers run in-process; scale workers by adding
replicas — job claims are atomic and crash-safe (`reclaimStale` requeues dead locks).

## Post-deploy smoke (mandatory)

1. `/health` → ok · `/ready` → database ok
2. Sign in to dashboard with bootstrap key → change nothing yet
3. Create project → create task → transition ready → dispatch agent
4. Confirm execution succeeds (artifact + handoff visible in Knowledge)
5. `GET /metrics` shows non-zero http/model series
6. Attempt production deployment WITHOUT approval → expect `202 APPROVAL_REQUIRED`
7. Approve via Approvals page → retry → succeeds
8. `GET /api/v1/audit/verify` → valid:true

## First-day configuration

- Budgets: `POST /api/v1/budgets` (org/daily/monthly)
- Extra team keys: script `AuthService.createKey(orgId, name, role)` per member
- Prometheus scrape: add target `<host>:3000/metrics`
