# Repository Inventory — Enterprise AI Agency OS

> Generated during independent verification on 2026-08-27.
> Scope: the ACTUAL repository (not the "Scraping Agent" template prompt). This is an
> AI Software Agency control plane + orchestrator, not a web scraper. Scraper-specific
> requirements from the template (OCR, PDF crawl, SSRF-to-metadata, etc.) are NOT APPLICABLE
> to this architecture and are called out as N/A below.

## Component Map

| Component | Path | Role | Runtime |
|---|---|---|---|
| Control Plane API | `apps/control-plane` (Fastify, `src/server.ts`) | REST `/api/v1`, RBAC, approvals, rate limit, SSE, health/ready/live, `/metrics` | Node 24 (TS native) |
| Dashboard | `apps/dashboard` (Vite + TS) | Real-data enterprise console (projects, kanban, agents, spend, findings, approvals, audit chain) | Browser / static served |
| MCP server | `apps/mcp-server` | Safe OpenCode/MCP tools over the control plane | Node 24 |
| @agency/core | `packages/core` | ids (uuidv7), errors, EventBus, logger, config, secret resolver | lib |
| @agency/db | `packages/db` | Versioned SQL migrations; SQLite (default) + PostgreSQL profile | lib |
| @agency/security | `packages/security` | RBAC matrix, human approval gates, hash-chained append-only audit log | lib |
| @agency/models | `packages/models` | Provider-agnostic model router: tier/cost routing, circuit breaker, budget guard | lib |
| @agency/orchestration | `packages/orchestration` | Agent registry (21 roles), task dependency graph + cycle detect, workflow engine (checkpoint/resume), job queue (retry/backoff/DLQ) | lib |
| @agency/integrations | `packages/integrations` | GitHub adapter, signed webhook emitter/verify (HMAC) | lib |
| @agency/delivery | `packages/delivery` | Autonomous delivery loop: worktree isolation, quality gates (DoR/DoD/threat/SLO/DORA), re-delivery convergence | lib |
| Observability | `infrastructure/observability` | Prometheus + Grafana compose profile | infra |
| CI/CD | `.github/workflows/{ci,docker,release,security}.yml`, `dependabot.yml` | lint/type/test/build, docker build+smoke+Trivy, SBOM, gitleaks, release | GitHub Actions |
| Deployment | `docker/Dockerfile.control-plane`, `docker/Dockerfile.*`, `docker-compose.yml` | Non-root container, profiles (default/postgres/observability) | Docker |

## Entry Points (verified)
- API boot: `node apps/control-plane/src/server.ts` → `/health`, `/ready`, `/live`, `/metrics`, `/api/v1/*`
- Build: `npm run build --workspaces --if-present` (dashboard builds via Vite; packages run as TS)
- Tests: `node --test "packages/**/test/*.test.ts" "apps/control-plane/test/*.test.ts"` (Node 24 native TS)
- Self-test: `node scripts/self-test.mjs`
- Migrate / seed: `scripts/migrate.mjs`, `scripts/seed.mjs`

## Data Flow (verified by tests + runtime)
User/API → Auth/RBAC → Approval gate (high-risk) → Orchestrator → Planner/Workflow engine
→ Agent registry → Job queue (idempotent, retry/backoff, DLQ) → Sandbox (process/docker)
→ Model router (tier/cost, circuit breaker, budget) → Provenance/audit (hash-chained)
→ Store (SQLite/Postgres) → Result → SSE/metrics → Dashboard.

## Tests present (120, all passing)
Cover: ids, config, secrets, EventBus, logger; RBAC matrix; audit tamper detection; approval
single-use/expiry; job queue idempotency/retry/DLQ/requeue; workflow checkpoint+resume;
stale-job reclaim (G-04); parallel no-double-exec (G-05/G-05b); restart recovery (G-10);
worktree isolation (G-09); model router fallback/circuit/budget; signed webhooks; sandbox
destructive-command screening; delivery re-delivery convergence; static gate (forbidden patterns).
