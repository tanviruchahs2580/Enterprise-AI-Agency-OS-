# Changelog

All notable changes. Format: Keep a Changelog; versioning: SemVer.

## [0.4.0] — 2026-08-25

### Added — universal QA cycle
- **UI runtime QA** (`scripts/ui-test.mjs` + Playwright Chromium): 6 dashboard
  pages verified in a real browser — render, zero console errors, zero failed
  requests.
- **Process observability**: RSS / heap-used / uptime gauges on `/metrics`.
- **API edge-case coverage**: malformed JSON → typed 400; oversized body
  rejection; concurrent duplicate-slug race (exactly one winner).
- **Load ceiling probe at 250 concurrency**: 0 errors @666 RPS, p95 392ms —
  documented SLO-compliant zone ≤~100–150 concurrent.
- Startup-to-healthy measured: ~2.7s.

### Fixed (found by the new QA)
- Dashboard called root-level `/ready` through the `/api/v1` prefix (404).
- Overview fetched tasks without required `projectId` (400).
- Malformed JSON bodies returned `INTERNAL` error code instead of a typed
  `VALIDATION_ERROR` client error.

## [0.3.0] — 2026-08-25

### Added — production certification cycle
- **Docker CI gate** (`docker.yml`): builds control-plane image on GitHub
  Actions, boots it against a Postgres service container, runs health/ready/
  auth/metrics smoke + **persistence-across-restart** check + non-root user
  verification + log secret-leak scan + **Trivy critical/high image scan**.
  Resolves the previously BLOCKED local container validation via automation.
- **Production certification command** `scripts/production-certify.mjs` —
  executes every runnable mandatory gate and emits
  `docs/PRODUCTION-CERTIFICATION-REPORT.md` with honest PASS/FAIL/BLOCKED.
- **Load test** `scripts/load-test.mjs`: progressive 10→100 concurrency;
  verified p95 ≤182ms, 0 errors at every stage (~614 RPS); HTTP 429 reported
  separately as designed backpressure (default limiter proven working).
- **PG extended validation** `scripts/verify-pg-extended.ts` (7 checks incl.
  cross-session optimistic locking, transaction rollback, bad credentials).
- **Observability definitions**: Grafana dashboards (executive/engineering/
  AI-cost/operations) + Prometheus alert rules with documented thresholds
  (`infrastructure/observability/`).
- Runbooks: INCIDENT-RESPONSE, SECURITY-RUNBOOK; ENTERPRISE-UAT scenario
  matrix A–L mapped to executed evidence.

### Security
- Control plane no longer logs the full admin API key (fingerprint only);
  auto-generated key printed once to stderr outside production.
- Revoked-key rejection covered by regression test.

### Fixed
- Model router: requests exceeding every candidate context window now fail
  fast with CONTEXT_OVERFLOW before any provider call.
- Dependabot blocked from TypeScript majors (typescript-eslint peer conflict).

## [0.2.0] — 2026-08-24

### Added — production infrastructure (all live- or integration-verified)
- **PostgreSQL driver**: synchronous bridge over `pg` (worker-thread, SAB
  result transfer), SQLite-style `?` → `$n` placeholder translation, portable
  migration runner. Live drill: migrate → idempotent re-run → CRUD →
  optimistic locking → FK integrity → full API smoke on PG 16.4.
- **Prometheus `/metrics`** (dependency-free): HTTP counters + duration
  histogram, queue depth by status, model requests/fallbacks/cost,
  execution states, approvals pending, database-up, build info.
- **Approval sweeper**: expired pending approvals flip to `expired` every 60s
  with hash-chained audit events; idempotent under concurrency.
- **Stale-job reclaim**: worker-crash locks requeued after 10 minutes; loop
  integrates periodic reclaim.
- **Reviews API**: `POST/GET /api/v1/tasks/:id/reviews` with axis/verdict
  validation and audit linkage.
- **Git worktree isolation loop**: namespaced branches, dirty-tree protection,
  intent-to-add diffs, commit→merge→cleanup (integration tests vs real git).
- **Dispatch idempotency keys**: client retries replay the original response.
- Runbooks: DEPLOYMENT-RUNBOOK, ROLLBACK-RUNBOOK, OPERATIONS-RUNBOOK;
  FINAL-PRODUCTION-GAP-MATRIX, FINAL-PRODUCTION-READINESS-REPORT,
  FINAL-PRODUCTION-RELEASE-REPORT.

### Security
- SSE hardening: raw API keys rejected in URLs; one-time 60s tickets
  (`POST /api/v1/events/ticket`) feed EventSource clients.
- Rate-limit buckets keyed by hashed identity+IP (collision-resistant).

### Fixed
- Bridge init payload write skipped → PG connect hung.
- Placeholder mismatch silently sent to pg → explicit count validation.
- Route-label cardinality collapsed resource names in metrics.
- Double driver close threw on shutdown paths.

### Verified
55/55 tests · coverage 90.8/82.5 · clean-env bootstrap drill · perf p95 17.7ms
(no regression) · backup/restore fresh drill · GitHub CI/security/release green.

## [0.1.1] — 2026-08-24

### Fixed (post-build verification pass — all with regression tests)
- **control-plane**: worker read execution id from the wrong payload nesting level;
  every dispatched execution would have retried into dead-letter.
- **security**: approval `ttlMinutes=0` silently became the 60-minute default
  (falsy-zero), making expiry unenforceable through the API.
- **orchestration/control-plane**: worker attempted the illegal
  ready→in_progress transition and swallowed the error, leaving tasks stuck;
  now advances ready→planned→in_progress per the lifecycle.
- **models**: default provider set lacked a STANDARD-tier model, so standard-tier
  agent dispatches failed candidate selection.

### Added
- Organizations API (`POST/GET /api/v1/organizations`) with owner-key issuance
  and roster seeding; cross-tenant isolation covered by new e2e suite.
- Missions & workstreams endpoints; deployment rollback e2e; approval-expiry e2e;
  concurrent-transition (optimistic-lock) e2e.
- Performance baseline harness (`scripts/perf-baseline.mjs`).
- Phase-44 verification report set (12 docs incl. security audit, failure-injection,
  performance, readiness score).

### Security
- react-router-dom upgraded 6.26 → 7.18.2 (open-redirect advisories).
- Production dependency audit: 0 vulnerabilities; esbuild dev-server advisory
  documented as accepted dev-only risk.

### Verified
- Coverage 90.86% line / 80.56% branch · perf p95 ≤ 17.6ms · backup/restore drill ·
  GitHub CI matrix + security + release workflows green.

## [0.1.0] — 2026-08-24

### Added
- **Core kernel** (`packages/core`): zod-validated config with production fail-fast,
  structured logger w/ secret redaction, typed error taxonomy, domain event bus,
  UUIDv7 ids, canonical-JSON hashing.
- **Persistence** (`packages/db`): `node:sqlite` driver + driver abstraction
  (PostgreSQL path documented), checksum-verified migration runner, schema v1
  (35 tables incl. audit chain, budgets, jobs, workflow runs, knowledge).
- **Security kernel** (`packages/security`): full RBAC matrix (11 roles),
  hash-chained append-only audit log with online verification, human approval
  gates for high-risk actions.
- **Model routing** (`packages/models`): tier/capability router, per-model circuit
  breakers, retry/backoff/timeout, never-silent fallbacks recorded to DB,
  budget guard integration, mock provider + OpenAI-compatible provider.
- **Orchestration** (`packages/orchestration`): 21-agent enterprise roster as tool
  contracts, task dependency graph with cycle detection and ready-queue,
  guarded task state machine, verifiable quality receipts, process/docker sandbox
  providers with destructive-command screening, persistent job queue
  (retry/backoff/dead-letter/requeue), resumable YAML-defined workflow engine.
- **Control plane** (`apps/control-plane`): Fastify REST API `/api/v1` — auth
  (hashed API keys), rate limiting, structured errors, SSE event stream,
  health/live/ready, projects, requirements, tasks, agents, executions+worker,
  models/costs/budgets, approvals, deployments (+rollback), security findings,
  knowledge search, audit + verify.
- **Dashboard** (`apps/dashboard`): enterprise console — live overview with SSE,
  projects, task kanban, agent fleet, model spend, security ops, approval gates,
  deployment rollback, knowledge search, hash-chain audit viewer. Real data only.
- **MCP server** (`apps/mcp-server`): stdio MCP exposing safe agency tools
  (status, projects, context, tasks, ready queue, knowledge search, approvals,
  audit verify) with contract tests.
- **Integrations** (`packages/integrations`): GitHub REST adapter (flagged),
  HMAC-signed outbound webhook emitter with bounded retries.
- **Infra**: Dockerfiles (non-root), compose profiles (core/postgres/
  observability), `.env.example`, bootstrap scripts (ps1/sh), migrate/seed/
  self-test/verify-production/SBOM scripts.
- **CI/CD**: GitHub Actions ci (ubuntu+windows matrix), security (gitleaks +
  npm audit + SBOM artifact), release (tag → checks → GH Release w/ SBOM);
  Dependabot; CODEOWNERS.
- **Docs**: QUICKSTART, ARCHITECTURE (C4/mermaid), SECURITY (STRIDE threat
  model), CONTRIBUTING, DEVELOPMENT, DEPLOYMENT, OPERATIONS (+backup/restore
  runbooks), DISASTER-RECOVERY (RPO/RTO), API reference, MODEL-ROUTING, AGENTS,
  SKILLS, WORKFLOWS, TROUBLESHOOTING, ROADMAP, ADRs, audit/risk docs.

### Security
- Secrets never stored in code/db (env-backed secret refs, hashed API keys).
- Destructive command screening at the sandbox layer (defense in depth).
- Production profile refuses unsafe configuration (sqlite/wildcard CORS/
  missing admin key/process sandbox).
