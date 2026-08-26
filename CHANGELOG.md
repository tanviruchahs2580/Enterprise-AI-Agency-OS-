# Changelog

All notable changes. Format: Keep a Changelog; versioning: SemVer.

## [0.9.0] — 2026-08-26

### Added — MASTER UPGRADE PHASE B (governance & agent intelligence, B1–B5)
- **B1 Genuine governance engine** (F-07): pure `evaluateGovernance()` in
  orchestration — real budget check via BudgetGuard, ownership/status checks,
  complexity classification (simple/module/service), modify→medium risk.
  Service-complexity deliveries auto-create a `delivery:auto` approval and
  BLOCK until decided (execution failed w/ APPROVAL_REQUIRED). Hardcoded
  ALLOW strings removed from the worker path.
- **B2 LLM advisory reviewers** (`FEATURE_LLM_REVIEWER`, default off):
  deterministic `reviewDiff` remains the sole AUTHORITY — advisory findings
  capped at major, deduped, may only worsen APPROVE→REQUEST_CHANGES; provider
  failures/timeouts skip silently; cost recorded as `advisory-review:<execId>`.
- **B3 LlmCodegen v2**: `spec.codegen='llm'` + semantics.examples drive
  model-generated modules with deterministic example-tests; fenced-output
  extraction with export/arity validation → clean VALIDATION block on
  malformed output; repair feeds diagnose info back to the model.
- **B4 Specialist handlers** (`FEATURE_AGENT_SPECIALISTS`, default off):
  `pm_decompose` job (stories doc), Definition-of-Ready warnings on task
  create, architect ADR drafts on modify-mode dispatches, SRE SLO stubs on
  deployment success. AGENTS.md roster marked wired for these four.
- **B5 Configurable perf budget**: `spec.perfBudget` clamped
  ([0.01,1000]ms / [100,1e6] iter), rejected at task creation when invalid;
  effective budget echoed in `benchmark_run`.

### Tests
Suite grown to **111/111** (governance matrix, advisory merge/worsen-only,
LLM generate/repair/malformed, perfBudget validator + tight/loose runs,
specialist handlers).

## [0.8.1] — 2026-08-26

### Fixed — MASTER UPGRADE PHASE A (P0 security hardening, A1–A7)
- **A1 Approval single-use + expiry** (F-01): migration 0002 adds `consumed_at` +
  lookup index; `assertApproved` enforces expiry & consumption atomically
  (conditional UPDATE), sweeper expires stale approved grants. Tests: expired
  deny, consumed deny, valid flow, sweeper flip.
- **A2 Atomic idempotency** (F-02): unique indexes (0003) on idempotency_keys &
  jobs; dispatch routes and enqueue now INSERT-first with loser-replay.
  New e2e: 10 parallel same-key dispatches → exactly one execution/job.
- **A3 CORS enforcement** (F-03): origin allow-list hook → 403 + audited
  `http.origin_blocked`; no-origin requests unaffected; public paths skipped.
- **A4 Sandbox transport** (F-04): new `ExecTransport` seam (Process/Docker);
  all generated-code spawns routed through it — zero direct node spawns left in
  delivery package; docker fail-closed without `AGENT_EXEC_CONTAINER_ID`.
- **A5 Auto-revert on postmerge failure** (F-05): `reset --hard base` +
  re-test + `postmerge_reverted` stage; main can never be left failing.
- **A6 Key/user lifecycle APIs** (F-06): POST /users, POST/GET/DELETE /keys,
  POST /keys/:id/rotate — material shown once, revocation immediate, full audit.
- **A7 Prod demo-flag guard**: injectFault / maxRepairAttempts>5 rejected in
  production dispatches.

### Tests
Suite grown to **98/98** (+21 this phase). Tag: `upgrade/phase-a-complete`.

## [0.8.0] — 2026-08-26

### Added — MASTER UPGRADE PROMPT Phase 0 (foundation hardening)
- **0.1 Baseline freeze**: tag `v0.7.0` + `release/0.7` branch; baseline SHA recorded
  (`docs/evidence/BASELINE-SHA.txt` = bacb024b0f00…).
- **0.2 Production config gate extended**: production now also rejects
  `SANDBOX_PROVIDER=process`; new `STRICT_SECRET_BACKEND=true` forbids plain-env
  sensitive secrets (config gate + runtime resolver double-check). +5 regression tests.
- **0.5 Secrets seam**: `packages/core/src/secrets.ts` — `SecretResolver`
  interface with `env | mock` backends (vault/aws-sm/doppler slots documented);
  `resolveSensitive()` defense-in-depth.
- **0.6 DB hardening**: `Db` slow-query instrumentation hook wired to
  `SLOW_QUERY_LOG_MS` (default off; live container verified 0 noisy lines).
- **0.7 Suite ≥90**: property-style deliverySpec validation (unit+API), chaos
  timeout-injection run (no hang, no orphan worktree), gates unit matrix.
  Suite now **90/90**.
- **0.4 Docker hardening**: control-plane & dashboard run `read_only` rootfs +
  tmpfs + `no-new-privileges` + `cap_drop ALL` (+ nginx CHOWN/SETGID/SETUID)
  + mem/cpu limits. Verified healthy; slow-query noise eliminated after fix;
  in-container autonomous delivery → task completed on the hardened stack.
- **0.8 Runbooks**: docs/runbooks/{INCIDENT,KEY-ROTATION,TENANT-OFFBOARDING,
  BACKUP-RESTORE,SECRETS-ROTATION,DATABASE-FAILOVER}.md; key-rotation &
  tenant-offboarding executed live with evidence (.data-cert/runbooks/).

### Phase 1 starter (Step 1.1 dual-mode)
- DeliverySpec gains `mode: "deterministic" | "agentic"`; `selectEngine()`
  routes fail-closed (`DEPENDENCY_UNAVAILABLE` without MODEL key). Scripted
  agentic engine emits auditable tool trajectory persisted as knowledge
  (`Trajectory <module>`); same gate sequence as deterministic mode.

### Blocked / flagged (documented per operating contract)
- Full OpenTelemetry SDK dep (0.3) — structured trace_id already flows; OTLP wiring pending dep approval.
- Stryker mutation (0.7 partial), GitHub branch-protection API + OIDC/SCIM/pgvector/gVisor/Helm/Terraform/pen-test (Phases 3–7, 10) — external creds/infra or large deps; seams documented in ROADMAP.

## [0.7.0] — 2026-08-26

### Added — master-pipeline alignment (AGENCY_OS_MASTER_PROMPT v1.0)
Delivery pipeline extended to the full governed lifecycle. New fail-closed stages
(emitted as `Delivery.<stage>` events and asserted by ordered regression tests):
- **static_analysis** — pre-test source gate on generated modules: eval /
  new Function / dynamic require / io-network imports / prototype pollution → BLOCK.
- **contract_verified** — exported surface must equal `spec.ops` exactly
  (missing export, arity drift, undeclared export all block).
- **benchmark_run** — out-of-process micro-benchmark (20k iterations per op,
  absolute file-URL import); budget avg < 5 ms/op.
- **docs_generated** — auto-generated `README.md` (API table, usage, quality notes)
  is now part of every delivery commit.
- **postmerge_verified** — after merge/converge, `node --test` re-runs on main;
  failure fails the delivery even post-commit.
Worker-side governance & knowledge (Phase 0/1/3/5):
- `Governance.classified` / `Governance.gate` / `Governance.impact` events before execution.
- Knowledge documents persisted per run: **EnrichedSpec**, **ADR**, **TestStrategy**,
  per-delivery **SBOM** (content-addressable file hashes), plus handoff enriched with
  `evidenceHash`, benchmark results, duration and a **retrospective**.
- Clean builds walk the task state machine to **completed**
  (ready→…→completed); fault-injected demo builds stop at review (human-in-the-loop).
- `Promotion.staging_ready` event emitted; external promotion stays operator-gated.

### Tests
Suite grown to **77**: ordered-governance test, static-gate eval BLOCK,
contract-mismatch BLOCK, convergence + post-merge interplay.

## [0.6.0] — 2026-08-26

### Fixed — V2.0 artifact-level validation findings
- **docker/Dockerfile.control-plane (P1)**: `packages/delivery` workspace manifest was never copied into
  the image and `git` was absent — autonomous delivery could not run from the production container.
  Both fixed; proven by an end-to-end in-container delivery run on the rebuilt image
  (worktree → tests → self-heal → merge → receipt, non-root user, artifact verified in /app/data volume).
- **auth hot path (P2)**: `last_used_at` wrote to Postgres on every request; throttled to one write per
  key/minute. In-container burst: p95 331→227ms, RPS 84→107 (+28%).
- **security headers (P2)**: added `x-content-type-options:nosniff`, `x-frame-options:DENY`,
  `referrer-policy:no-referrer`, `permissions-policy` on every response (+ e2e assertion).
- meta/metrics version drift corrected to 0.6.0.

### Added — delivery UX & extensibility (all 7 improvement items executed)
- **DeliverySpec custom test vectors**: ops now accept `cases:[[a,b,expected],…]` — emitted
  tests use the caller's vectors instead of canonical defaults; repair loop unchanged.
  Unit+integration covered (`CUSTOM CASES` runs real node --test with 3 vectors).
- **Structured task creation**: `POST /api/v1/tasks` accepts `deliverySpec` as a JSON
  object; server validates and serializes it into the worker-readable description
  (no more hand-built JSON strings). Invalid shapes → typed 400.
- **Dashboard "Delivery" page** (`/delivery`): live table of autonomous runs — status,
  hash-chained receipt flag, summary, finished time — auto-refresh every 5s.
- **Delivery runs list API**: `GET /api/v1/delivery/runs?limit=` (org-scoped, joined
  task titles + receipt flag).
- **Client idempotency on dispatch**: `POST /api/v1/delivery/runs` accepts
  `idempotencyKey`; duplicate keys replay the original execution (202→200 pattern).
- **Per-run test timeout**: `testsTimeoutMs` threads from route → job → pipeline →
  each `node --test` attempt (default 120000).
- **Completion webhook**: when `WEBHOOK_OUTBOUND_URL`/`_SECRET` are configured the
  worker emits HMAC-signed `delivery.completed` / `delivery.blocked` events via the
  existing `SignedWebhookEmitter` (3 attempts, exponential backoff).
- **Delivery metrics**: `agencyos_delivery_runs_total{result="succeeded|blocked"}`
  on `/metrics`, anchored to audit actions. Build-info bumped to 0.6.0.
- **Knowledge default view**: empty `?q=` now returns the 25 most recent documents
  (org-scoped) instead of an empty list.

### Tests
- Suite grown to **71 tests** (was 66): spec-field validation, dispatch idempotency,
  runs-list exposure, knowledge default view, custom-vector pipeline run.

## [0.5.1] — 2026-08-26

### Fixed — Docker & build hardening (enterprise-grade closure)
- docker/Dockerfile.dashboard: added missing workspace package.json copy before npm ci so dashboard build layer cache is correct and image build is reproducible without dev-deps leakage. Both images now build clean locally: control-plane and dashboard (docker compose build PASS).
- docker-compose.yml production profile: control-plane now requires DATABASE_URL explicitly for postgres profile (no silent SQLite fallback in production — config fail-fast preserved).
- scripts/verify-pg.ts: reads DATABASE_URL from env (CI/local parity) instead of hardcoded credential.
- package-lock.json: regenerated to 0.5.0 (was stale 0.4.0).
- sbom-v0.5.0.json: regenerated from lockfile (218 kB, CycloneDX 1.5).

### Verified — full local Docker stack
- docker compose --profile postgres up --wait: control-plane healthy (production, PG 16.4), dashboard healthy, /health /ready /metrics served, authenticated project create/read, persistence across container restart, non-root user agency, log scan shows no secret leakage.
- Also verified in CI: docker.yml success on main (health/ready/auth/metrics/persistence/non-root/log-scan + Trivy critical/high).

### Demo re-validated
- Live demo with injected fault re-run against local server: SUCCESS 9/9 (repaired mul operator, merged commit, receipt, audit, handoff, metrics).

### Fixed — live-usage QA findings (2026-08-26 session)
- packages/delivery pipeline: re-delivery of an already-correct module with injected fault no longer fails on
  `git commit` (nothing to commit) — self-heal that converges back to main now records a `converged` stage and
  succeeds without a net diff commit (`DeliveryOutcome.converged`, execution summary `self-heal converged to main`).
  Regression test: `RE-DELIVERY CONVERGENCE` in packages/delivery/test/delivery.test.ts.
- Failed/blocked delivery paths left stale `prunable` worktree registrations — pipeline now runs
  `git worktree prune` on every exit path; verified clean `git worktree list` after failure scenarios.
- Control-plane delivery worker: job rows for blocked deliveries reported `succeeded`; execution row remains the
  source of truth (documented) while job-level semantics unchanged.

### Verified — live usage session (QA + UX)
- Autonomous build of a `mathutils` module (add/mul/sub): clean run merged to managed repo main; fault-injected
  run self-healed → green → receipt, both hash-chained audited.
- SOP evidence 18/18 PASS (state machine ready→review, receipt, audit chain valid, handoff knowledge, metrics,
  worktree hygiene, no secrets) + UI 11/11 dashboard pages render with zero console errors/failed requests.

## [0.5.0] — 2026-08-25

### Added — autonomous delivery loop (fully verified, demo-proven)
- **packages/delivery**: TemplateCodegen + reviewDiff + runTests + self-healing
  pipeline (worktree -> generate -> test -> diagnose -> repair -> review -> commit ->
  merge). The loop is **real** — it writes files, runs `node --test` in a
  child process (with `NODE_TEST_CONTEXT` stripping), parses actual failure
  output, patches the operator, retests — proven by `packages/delivery` tests
  (happy path + injected-fault -> red -> repaired -> green -> merged).
- **Control plane**: `POST/GET /api/v1/delivery/runs` — executes the closed loop
  against a managed git repo per project (`data/repos/<slug>-<id>/`) with
  quality receipt, handoff knowledge, and audit linkage.
- Delivery-worker job handler `deliver_task` registered in `server.ts`.
- **Demo harness** `scripts/demo-delivery.mjs`: HTTP end-to-end proof of the
  full lifecycle with intentional fault injection -> self-heal -> review -> commit.
- Documentation: AUTONOMOUS-DELIVERY.md + AUTONOMY-SCORECARD.md (31/31 PASS per
  master scorecard).

### Fixed
- `NODE_TEST_CONTEXT` leaking into spawned test children prevented real test
  discovery (nested `node --test` silently skipped). Fixed via `cleanTestEnv()`.
- Flexible failure-output parsing (`actual: / 5 !== 6 / === <n>`) + operand
  hints from test titles for deterministic repair.

## [0.4.0] — 2026-08-25

### Added — universal QA cycle
- **UI runtime QA** (`scripts/ui-test.mjs` + Playwright Chromium): 6 dashboard
  pages verified in a real browser — render, zero console errors, zero failed
  requests.
- **Process observability**: RSS / heap-used / uptime gauges on `/metrics`.
- **API edge-case coverage**: malformed JSON -> typed 400; oversized body
  rejection; concurrent duplicate-slug race (exactly one winner).
- **Load ceiling probe at 250 concurrency**: 0 errors @666 RPS, p95 392ms —
  documented SLO-compliant zone.
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
- **Load test** `scripts/load-test.mjs`: progressive 10->100 concurrency;
  verified p95 182ms at every stage (~614 RPS); HTTP 429 reported
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
