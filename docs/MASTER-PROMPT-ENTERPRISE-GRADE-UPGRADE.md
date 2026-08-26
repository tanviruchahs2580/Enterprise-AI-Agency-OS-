# MASTER PROMPT — ENTERPRISE-GRADE UPGRADE EXECUTION PROTOCOL
## Enterprise-AI-Agency-OS v0.7.0 → v1.0.0 (Full Autonomous Execution)

> **HOW TO USE:** Feed this entire document to your executing agent (or engineering team) as the single source of truth.
> Execute PHASES A→F strictly in order. No step may be skipped, reordered, or partially completed.
> Every step has: Goal → Files → Implementation Spec → Tests → Acceptance Criteria → QA Gate.
> A step is DONE only when its acceptance criteria pass AND the full verification loop is green.

---

# 0. ROLE & MISSION

You are a **senior full-stack engineer + SRE + security engineer** operating on the repository
`Enterprise-AI-Agency-OS` (Node.js 24, TypeScript ESM, Fastify, node:sqlite/pg, zod, workspaces monorepo).

**Mission:** Take the platform from v0.7.0 (audit score ~6.8/10) to **enterprise-grade v1.0.0 (~9.5/10)**
by executing Phases A–F below: implement → test → run → debug → QA → refactor → document → verify.

---

# 1. GROUND RULES (NON-NEGOTIABLE, APPLY TO EVERY STEP)

## 1.1 Environment facts (verified 2026-08)
- Node `>=24` (`.nvmrc`), npm workspaces: `packages/{core,db,delivery,integrations,models,orchestration,security}` + `apps/{control-plane,dashboard,mcp-server}`
- Tests: `node --test` via `npm test` (**77 tests baseline — must never regress; only grow**)
- Lint: `npm run lint` · Typecheck: `npm run typecheck`
- DB: SQLite default (`node:sqlite`, WAL), PostgreSQL in production (driver abstraction in `packages/db/src/driver.ts`)
- Migrations: `packages/db/src/migrations/*.sql`, checksum-verified runner (`packages/db/src/migrate.ts`) — **never edit an applied migration; always append new numbered files**
- Baseline evidence: audit found P0 issues F-01…F-06 (see §2 Phase A mapping)

## 1.2 The Verification Loop (run after EVERY step)
```bash
npm run lint && npm run typecheck && npm test
```
- Any failure ⇒ STOP, debug, fix before proceeding. Never continue on red.
- New code requires new tests. Bug fix requires a regression test that fails before the fix.
- Coverage target (introduced in Step D3): lines ≥80%, branches ≥60% — enforced from that step onward.

## 1.3 Commit Protocol
- One logical step = one or more commits: `fix(security): F-01 approval single-use + expiry enforcement`
- NEVER commit secrets, keys, `.env`, `data/repos/**`, `data/*.sqlite*`.
- Each commit message references the Finding/Step ID (F-xx / Ax / Bx …).
- Before starting any phase: `git status` must be clean; tag milestones:
  `git tag upgrade/phase-a-complete` etc.

## 1.4 No-Skip Rule
If a step is genuinely blocked, you must: (a) record the blocker in
`docs/UPGRADE-BLOCKERS.md` with cause + proposed workaround, (b) still deliver the
test proving current behavior, (c) proceed only after documenting. Silent skipping = failure.

## 1.5 Debugging Protocol
1. Reproduce with the smallest failing test.
2. Isolate: package-level unit → app-level integration → e2e (`apps/control-plane/test/e2e.test.ts`).
3. Fix root cause, not symptom; add regression test; re-run §1.2 loop.
4. If flaky: mark nothing flaky — fix determinism (inject clock/ids via `packages/core/src/clock.ts`, `ids.ts` seams).

## 1.6 Refactoring Protocol
- Behavior-preserving refactors are separate commits (`refactor(scope): ...`) with green loop before AND after.
- Follow existing conventions: no TS parameter properties (native type-stripping — see note in
  `packages/integrations/src/index.ts:81-82`), argument-array git/exec calls only,
  fail-closed gates, AppError codes from `packages/core/src/errors.ts`.

---

# 2. PHASE A — SECURITY HARDENING (P0, DO FIRST)

## Step A1 — Approval single-use + expiry enforcement  [Fixes F-01]
- **Goal:** An approved decision must be consumed by exactly one action and must expire.
- **Files:** `packages/security/src/approvals.ts`, `packages/db/src/migrations/0002_approval_consumption.sql`,
  `packages/security/test/security.test.ts`, `apps/dashboard/src/pages/Approvals.tsx` (status display).
- **Spec:**
  1. Migration `0002`: `ALTER TABLE approvals ADD COLUMN consumed_at TEXT NULL; CREATE INDEX idx_approvals_lookup ON approvals(org_id, action, resource_type, resource_id, decision);`
  2. In `assertApproved()` (approvals.ts:111): add `AND expires_at > ?` check against now; add
     `consumed_at IS NULL`; on success immediately `UPDATE approvals SET consumed_at=? WHERE id=?`
     inside a transaction (consume-on-read).
  3. Expired-but-approved rows: sweeper (`apps/control-plane/src/sweeper.ts`) also marks
     `decision='expired'` when `decision='approved' AND consumed_at IS NULL AND expires_at < now`.
- **Tests:** expired approval denies deploy; second deploy attempt with same approval denies (already consumed); valid flow still works end-to-end.
- **Acceptance:** all three cases proven by automated tests; `/api/v1/deployments` production path returns APPROVAL_REQUIRED when approval consumed.
- **QA gate:** grep confirms no other caller of assertApproved bypasses consumption.

## Step A2 — Atomic idempotency (dispatch + enqueue)  [Fixes F-02]
- **Goal:** Concurrent duplicate requests produce exactly one execution/job.
- **Files:** `packages/db/src/migrations/0003_idempotency_unique.sql`, `apps/control-plane/src/app.ts`
  (delivery.runs POST ~line 500-585, executions POST ~line 662-722), `packages/orchestration/src/jobs.ts` (enqueue 45-75).
- **Spec:**
  1. Migration: `CREATE UNIQUE INDEX IF NOT EXISTS ux_idem_scope_key ON idempotency_keys(org_id, scope, key);`
  2. Replace SELECT-then-INSERT with INSERT-first inside try/catch on unique violation →
     re-SELECT and return stored `response_hash` (HTTP 200). Do the same for jobs.enqueue idempotency
     branch inside a transaction.
  3. Add unique index on `jobs(idempotency_key)` where idempotency_key not null.
- **Tests:** concurrency test — fire 10 parallel same-key dispatches (Promise.all) against in-memory app;
  assert exactly 1 execution row, 1 job, 9 identical responses.
- **Acceptance:** race eliminated under `--test-concurrency`; existing G-12 idempotency test still green.
- **QA gate:** no remaining check-then-insert patterns on idempotency paths (`grep -n "SELECT id FROM idempotency_keys"` review).

## Step A3 — CORS enforcement hook  [Fixes F-03]
- **Files:** `apps/control-plane/src/app.ts`, `apps/control-plane/test/e2e.test.ts`.
- **Spec:**
  1. onRequest hook: if header `origin` present AND url not in PUBLIC_PATHS/metrics:
     allow when origin ∈ config.CORS_ORIGIN list (exact match, trimmed); else reply 403
     `AppError("FORBIDDEN","origin not allowed")` + audit event `http.origin_blocked` (low risk).
  2. Non-browser requests (no origin header) unaffected. Dashboard static server stays same-origin.
  3. Document behavior in `docs/API.md`.
- **Tests:** allowed origin passes; evil origin blocked; no-origin curl-style request passes.
- **Acceptance:** e2e asserts 403 + audit entry exists.

## Step A4 — Sandbox enforcement for delivery subprocesses  [Fixes F-04]
- **Goal:** Generated/untrusted code executes ONLY through the configured SandboxProvider.
- **Files:** `packages/delivery/src/runner.ts` (runTests), `packages/delivery/src/gates.ts` (runBenchmark),
  `packages/delivery/src/pipeline.ts`, `packages/orchestration/src/sandbox.ts`, context wiring in
  `apps/control-plane/src/context.ts`, `packages/delivery/test/delivery.test.ts`.
- **Spec:**
  1. Introduce `ExecTransport` interface in delivery package: `exec(argv[], {cwd, timeoutMs}): Promise<ExecResult>`.
  2. Two implementations: `ProcessTransport` (current direct spawn, dev/test default) and
     `SandboxTransport` wrapping `SandboxProvider.exec` from @agency/orchestration (docker profile).
  3. Pipeline options gain `transport`; control plane wires it from `ctx.config.SANDBOX_PROVIDER`
     (`docker` → DockerSandbox-backed transport; else ProcessTransport).
  4. runBenchmark/runTests accept transport; default param keeps package API backward compatible.
  5. Boot guard already refuses process sandbox in prod — extend it: prod + docker-unavailable at delivery time ⇒ clean BLOCK, never host fallback.
- **Tests:** unit — pipeline called with docker config uses SandboxTransport (assert argv[0]==='docker');
  integration — fault path still works with ProcessTransport (all existing delivery tests unchanged).
- **Acceptance:** zero direct `spawn(process.execPath` left outside transports (`grep -rn "spawn(process.execPath" packages/ | grep -v transport`).

## Step A5 — Auto-revert on post-merge failure  [Fixes F-05]
- **Files:** `packages/delivery/src/pipeline.ts` (lines ~248-268), `packages/orchestration/src/worktree.ts`,
  tests in `packages/delivery/test/delivery.test.ts`.
- **Spec:**
  1. After `pmMain.failed > 0`: execute `git revert --no-edit <commitSha>` on main (argument-array exec);
     if revert conflicts (shouldn't for ff merges) → `git reset --hard <baseCommit>` using handle.baseCommit.
  2. Re-run postmerge test on reverted main; emit stage `postmerge_reverted` with detail
     `{revertedSha, mainGreen:boolean}`; outcome stays `ok:false, blocked:"post-merge verification failed (auto-reverted)"`.
  3. Audit: control plane maps this stage to critical `delivery.postmerge_reverted` event.
- **Tests:** inject a module whose tests pass in worktree but fail on merged main (fixture: test reads env var set only on main workspace run) → assert main HEAD == base commit after run, stage recorded.
- **Acceptance:** main is never left failing; convergence path untouched.

## Step A6 — Key & user lifecycle APIs  [Fixes F-06]
- **Files:** `apps/control-plane/src/app.ts`, `apps/control-plane/src/auth.ts`,
  `packages/db/src/migrations/0004_users_active.sql` (if needed), e2e tests.
- **Spec:**
  1. Routes (all audited):
     - `POST /api/v1/users` (settings:write) {name, role} → creates user row, returns id.
     - `POST /api/v1/keys` (settings:write) {name, role, userId?} → material returned ONCE.
     - `GET /api/v1/keys` (settings:read) → id,name,role,last_used_at,revoked_at (NEVER hash/material).
     - `DELETE /api/v1/keys/:id` (settings:write) → soft revoke (sets revoked_at).
     - `POST /api/v1/keys/:id/rotate` → revoke old + issue replacement atomically, return new material once.
  2. All events audit risk high/critical (`key.created`,`key.revoked`,`key.rotated`,`user.created`).
  3. Role validated against RBAC `Role` union; scopes column stays `[]` (reserved).
- **Tests:** full lifecycle e2e: create→authenticate→revoke→401; rotate→old 401/new 200; cross-org delete denied.
- **Acceptance:** revoked key cannot authenticate (auth.ts:77 path exercised by route-driven test).

## Step A7 — Prod-gate demo flags  [Fixes F-11 early]
- **Files:** `apps/control-plane/src/app.ts` (delivery.runs handler).
- **Spec:** If `NODE_ENV=production` and body.injectFault truthy → 400 VALIDATION_ERROR "fault injection disabled in production". Same for `maxRepairAttempts > 5`.
- **Tests:** config-matrix test (local allows, production rejects).

### PHASE A EXIT CRITERIA
- [ ] All A1–A7 acceptance criteria pass; `npm test` count ≥ baseline+~20 new tests, 0 failures.
- [ ] `git tag upgrade/phase-a-complete`
- [ ] Update `docs/SECURITY-AUDIT-REPORT.md`: mark F-01..F-06 resolved with commit SHAs.

---

# 3. PHASE B — REAL GOVERNANCE & AGENT INTELLIGENCE

## Step B1 — Genuine governance engine  [Fixes F-07]
- **Files:** `apps/control-plane/src/delivery.ts` (Phase 0 block ~88-99), new
  `packages/orchestration/src/governance.ts`, tests.
- **Spec:**
  1. `Governance.evaluate(ctx,{orgId,projectId,taskId,executionId,spec})` returns
     `{decision:'ALLOW'|'BLOCK', reasons[], complexity, impactMode, riskLevel, budgetCheck}`.
  2. Real checks: (a) task belongs to org & status dispatchable; (b) `BudgetGuard.check(estimateUsd=0)`
     daily/org budgets (blocks even $0 engine when org over budget); (c) impact mode modify ⇒ risk medium;
     opsCount>8 ⇒ complexity service ⇒ require approval auto-created via `ctx.approvals.request(...)`
     action `delivery:auto`, riskLevel high; BLOCK until approved (execution failed w/ APPROVAL_REQUIRED semantics preserved for retry).
  3. Replace hardcoded strings at delivery.ts:93-99 with evaluation output; BLOCK emits
     `Governance.gate decision=BLOCK` + `Delivery.blocked` + audit high `delivery.blocked`.
- **Tests:** over-budget org blocks; modify-mode sets risk medium + ADR mentions safeguards; service-complexity creates approval and blocks until decided; happy path ALLOW payloads contain real computed values.
- **Acceptance:** no literal `"ALLOW"` string remains unconditionally (`grep '"ALLOW"' apps/` shows only computed results).

## Step B2 — LLM advisory reviewers wired behind flag  [Fixes F-15]
- **Files:** `packages/delivery/src/reviewer.ts`, `packages/models/*` (router seam), pipeline options,
  `packages/core/src/config.ts` (+`FEATURE_LLM_REVIEWER: Bool(false)`), delivery.test.ts.
- **Spec:**
  1. `reviewDiff(files)` stays deterministic authority. Add optional
     `advisoryReview(spec, diffSummary, router, tier)` returning extra `ReviewFinding[]` (severity ≤ major only).
  2. Pipeline: when flag on AND router has non-mock provider → merge advisories (dedupe by rule+path);
     deterministic verdict can worsen (APPROVE→REQUEST_CHANGES) but never improve.
  3. Advisory call wrapped in try/catch + timeout 30s; failure = skip advisory (log warn), never blocks delivery.
  4. Cost recorded via ctx.budget.recordSpend with reason `advisory-review:<execId>`; reviewer agent ids
     (code-reviewer/adversarial-reviewer) referenced in knowledge doc metadata.
- **Tests:** flag off → identical to today; mock provider on → advisory finding appears in review payload;
  provider throws → delivery succeeds with warn.
- **Acceptance:** deterministic-only guarantee documented in AUTONOMOUS-DELIVERY.md §review.

## Step B3 — Codegen engine v2 (LLM path + richer spec)  [Fixes F-19]
- **Files:** `packages/delivery/src/types.ts`, new `packages/delivery/src/llm-codegen.ts`,
  `apps/control-plane/src/delivery.ts` (engine selection), tests.
- **Spec:**
  1. Extend DeliverySpec op: optional `semantics?: {description:string; examples:[{args:number[];returns:number}]}` and `codegen?: 'template'|'llm'`.
  2. `LLMCodegen implements CodegenEngine`: prompt = system contract (pure ESM function, exact exports/arity, no io) + spec JSON; output fenced JS extracted deterministically; generate() produces src+test+package+README like TemplateCodegen (tests generated FROM examples).
  3. repair() feeds diagnose.ts parsed info back as user message (expected/actual/operand hints).
  4. Selection: spec.codegen==='llm' AND provider configured ⇒ LLMCodegen else TemplateCodegen (fallback logs strategy in `code_generated` detail).
  5. Budget pre-flight via router budget guard; cost lands in cost_events 5-scope.
- **Tests:** with mock provider scripted to return valid then broken then fixed module — full RED→repair→GREEN loop; malformed model output → clean VALIDATION block (no crash); template path untouched.
- **Acceptance:** one non-arithmetic module (e.g., string ops described via semantics.examples) delivered e2e with all gates green.

## Step B4 — Specialized agent handlers (PM / requirements / architect / sre)
- **Files:** `packages/orchestration/src/workflow.ts`, `apps/control-plane/src/workers.ts`, registry seeds.
- **Spec:**
  1. Job types: `pm_decompose` (task → stories knowledge docs kind=fact tagged 'stories'),
     `req_readiness_check` (Definition-of-Ready validator on task create: title≥8 chars, description non-empty, projectId exists — else TaskCreated event carries warnings),
     `architect_adr_draft` (auto-draft ADR knowledge doc on first modify-mode delivery),
     `sre_postdeploy_check` (after deployment succeed: create operational knowledge doc stub with SLO fields).
  2. Each handler: contract-tier model call OR deterministic logic (documented per agent), budget-scoped spend, handoff doc update, own timeout.
  3. Wire as optional workflow stages (flag-gated `FEATURE_AGENT_SPECIALISTS`, default off) so core delivery unchanged.
- **Tests:** each handler unit-tested; workflow with specialists completes and persists expected docs; flag off → zero behavior change.
- **Acceptance:** AGENTS.md roster table updated with "wired: yes" markers for these four.

## Step B5 — Configurable benchmark budget  [Fixes F-18]
- **Files:** `packages/delivery/src/types.ts`, `gates.ts`, pipeline wiring, tests.
- **Spec:** DeliverySpec gains `perfBudget?: {avgMsPerOp?:number; iterations?:number}`; defaults stay `{5,20000}`; validation clamps iterations 100..1_000_000, avgMsPerOp 0.01..1000. Stage detail echoes effective budget.
- **Tests:** custom budget respected (slow-fixture op fails tight budget, passes loose); invalid clamp rejected server-side.

### PHASE B EXIT CRITERIA
- [ ] Governance decisions are computed, auditable, budget-aware.
- [ ] LLM reviewer + codegen paths tested with mock providers; deterministic guarantees intact.
- [ ] Tag `upgrade/phase-b-complete`; update `WORKFLOWS.md` + `AUTONOMOUS-DELIVERY.md`.

---

# 4. PHASE C — RELIABILITY & SCALE

## Step C1 — Distributed-safe rate limiting  [Fixes F-09]
- **Files:** new `apps/control-plane/src/ratelimit.ts`, app.ts wiring, config additions
  (`RATE_LIMIT_STORE=memory|postgres`), tests incl. pg variant (skippable when no PG).
- **Spec:** token-bucket in `rate_limit_counters(org_id,key_id,route_class,window_start,count)` table
  with atomic UPSERT `count=CASE WHEN window_start<now THEN 1 ELSE count+1 END RETURNING count`;
  memory store kept for dev/tests behind interface. Response headers `ratelimit-limit`, `ratelimit-remaining`,
  `retry-after` on 429. Route classes: `default`(600/min), `dispatch`(60/min).
- **Tests:** exceed dispatch class → 429 + retry-after present; window rollover resets; two simulated instances share counters (same table).

## Step C2 — Durable webhooks  [Fixes F-08]
- **Files:** migration `0005_webhook_queue.sql` (reuse `webhook_events` table: add columns
  `attempts INT DEFAULT 0, next_attempt_at TEXT, last_status TEXT`), new job type `webhook_deliver` in
  `apps/control-plane/src/workers.ts` (or dedicated module), integrations emitter refactor, tests.
- **Spec:**
  1. On completion: persist webhook_events row(status pending, payload, signature ts) BEFORE emitting;
     worker claims due rows (≤5 attempts, exponential backoff 400ms*2^n capped 5min via run_after),
     sends HMAC-signed POST, records status_code/last_status, marks delivered/failed(dead_letter alert event `WebhookFailed`).
  2. Replace fire-and-forget `void emitter.emit(...)` at delivery.ts:276 with enqueue.
- **Tests:** receiver 503 twice then 200 → delivered with attempts=3; permanent 500 → dead-letter + event; crash between persist and send → reclaim delivers (G-10 pattern).

## Step C3 — Deployment roles + sweeper leader lease
- **Files:** `packages/core/src/config.ts` (+`ROLE=all|api|worker`), `server.ts`, compose profiles,
  `scripts/dev.mjs`, tests.
- **Spec:** `ROLE=api` skips jobs.start()+sweeper; `worker` runs workers+sweeper only, no HTTP listen (health via periodic stdout);
  `all` default unchanged. Sweeper leader lease: Postgres `pg_try_advisory_lock(hashtext('agencyos:sweeper'))` /
  sqlite `_leader_lease` row with heartbeat TTL 30s; non-leader sweeps skipped.
- **Tests:** ROLE=api boots without queue processing (enqueue then assert still pending after poll window);
  lease: second sweeper instance no-op while first alive.

## Step C4 — Jobs↔execution proper join  [Fixes F-13]
- **Files:** migration `0006_jobs_execution.sql` (`ALTER TABLE jobs ADD COLUMN execution_id TEXT NULL; CREATE INDEX ...`),
  enqueue sites set it, app.ts GET /delivery/runs replaces LIKE filter (line ~597) with
  `JOIN jobs j ON j.execution_id = e.id AND j.job_type='deliver_task'`.
- **Tests:** runs listing returns exactly dispatched set; legacy rows (null execution_id) don't break query.

## Step C5 — State-walk integrity reporting  [Fixes F-10]
- **Files:** `apps/control-plane/src/delivery.ts` (~189-196).
- **Spec:** collect failed transitions into array; append to handoff content `stateWalk:{applied[],failed[{to,reason}]}`;
  emit warning domain event `TaskStateWalkPartial` when failed.length>0. Remove silent catch-break.
- **Tests:** force one illegal transition mid-chain (pre-seed task status) → handoff contains failed entry + event emitted; normal chain unaffected.

## Step C6 — Backup automation + restore drill
- **Files:** new `scripts/backup.mjs`, `scripts/restore.mjs`, `docs/DISASTER-RECOVERY.md` update,
  compose comment/cron example.
- **Spec:** backup: sqlite → `VACUUM INTO data/backups/agencyos-<ts>.sqlite` (pg → pg_dump via child env DATABASE_URL);
  retention keep-last-N env BACKUP_KEEP (default 14) + manifest json with sha256; restore: verify checksum → replace file (stop-note printed). Idempotent, exit codes documented.
- **Tests:** script roundtrip on temp dir (backup→mutate→restore→content equality), manifest verifies.

### PHASE C EXIT CRITERIA
- [ ] Multi-instance safe (rate limit shared, leader-elected sweep, durable webhooks).
- [ ] Tag `upgrade/phase-c-complete`; OPERATIONS-RUNBOOK.md sections added.

---

# 5. PHASE D — OBSERVABILITY & COMPLIANCE

## Step D1 — Structured request logging + trace propagation  [Fixes F-12]
- **Files:** `app.ts` (enable fastify logger w/ redact headers.authorization; genReqId reuse), context log shim,
  bus.emit payload gains traceId passthrough, workers log with executionId, tests.
- **Spec:** every HTTP response logs `{reqId, method, url(route label), status, ms, keyId, orgId}` (no bodies, no secrets);
  delivery stages carry executionId+traceId end-to-end into webhook payload (`traceId` field).
- **Tests:** capture logger sink in test build → assert fields present; authorization never appears (redact proof).

## Step D2 — OpenTelemetry spans (flag-gated)
- **Files:** new `packages/core/src/otel.ts` (lazy no-op SDK unless FEATURE_OTEL=true), span helpers around:
  delivery pipeline stages, router.complete, job handler execution, HTTP plugin; config flag; docs.
- **Spec:** zero hard dependency — dynamic import('@opentelemetry/api') guarded; spans named `delivery.<stage>`, `model.complete`, `job.<type>`; traceparent accepted on inbound requests (W3C).
- **Tests:** flag off → pure overhead-free no-op (existing perf baseline within noise, scripts/perf-baseline.mjs);
  flag on with mock tracer → spans recorded for one delivery run.

## Step D3 — Coverage gates  [Fixes F-14]
- **Files:** package.json scripts (`test:cov` using c8), CI ci.yml step with thresholds, README badge section.
- **Spec:** `c8 --check-coverage --lines 80 --branches 60 --functions 70 npm test`; start with realistic excludes
  (dashboard UI, scripts/, *.d.ts) documented; ratchet: thresholds may only increase via PR.
- **Acceptance:** CI red if coverage drops; local command documented in DEVELOPMENT.md.

## Step D4 — OpenAPI contract  [Fixes F-22]
- **Files:** new `docs/openapi.json` generator script (`scripts/gen-openapi.mjs` reading zod schemas/route table),
  `@fastify/swagger-ui` optional dev-only mount at /docs (PUBLIC_PATHS consideration: keep auth'd), contract test
  asserting every registered route has schema entry (maintain manual map initially).
- **Spec:** v1 coverage of ALL routes in app.ts; error shape documented once ($ref AppError envelope);
  breaking-change check: CI compares openapi.json diff vs released tag (fail on removals/type-narrowing without version bump note).
- **Tests:** snapshot test openapi.json stability + completeness checker.

## Step D5 — SBOM + vulnerability scanning enforced in CI
- **Files:** .github/workflows/security.yml extension; scripts/generate-sbom.mjs already exists → wire.
- **Spec:** PR job: CycloneDX SBOM artifact upload; `npm audit --omit=dev --audit-level=high` (allowlist file
  `security/audit-allowlist.txt` with expiry dates, enforced stale-entry fail); osv-scanner optional container step.
  Release job attaches sbom-<version>.json (matches existing sbom-v*.json convention).
- **Acceptance:** intentionally vulnerable dep in scratch branch → CI red with clear message.

## Step D6 — Per-tenant audit checkpointing  [Fixes F-20]
- **Files:** migration `0007_audit_checkpoints.sql` (org_id, seq, hash, created_at), audit.ts addition, sweeper task,
  verify endpoint enhancement.
- **Spec:** hourly per-org anchor row (seq+hash); `/audit/verify` accepts `fromCheckpoint` to validate tenant slice
  independently; checkpoint rows themselves hash-chained (prev_checkpoint_hash).
- **Tests:** tamper between checkpoints detected in slice-verify; fresh org verifies standalone.

### PHASE D EXIT CRITERIA
- [ ] Logs/traces/metrics correlate by reqId+traceId; CI enforces coverage+SBOM+vuln gates.
- [ ] Tag `upgrade/phase-d-complete`.

---

# 6. PHASE E — ENTERPRISE IDENTITY & TENANCY

## Step E1 — OIDC SSO via IdentityProvider seam  [ADR-0007 payoff]
- **Files:** new `packages/security/src/oidc.ts`, auth.ts provider interface extraction, routes
  `/auth/login`,`/auth/callback` (web session cookies httpOnly+secure+sameSite=lax), dashboard login page,
  config (`OIDC_ISSUER`,`OIDC_CLIENT_ID`,`OIDC_CLIENT_SECRET`,`SESSION_SECRET`), tests with stub IdP.
- **Spec:** map IdP groups/roles→RBAC Role (configurable claim); session store in sessions table (reuse agent_sessions
  pattern or new user_sessions) with TTL; API keys remain for machine access; audit `user.login`.
- **Tests:** stub OIDC flow e2e (authorize→callback→session cookie→me endpoint→logout revokes).

## Step E2 — Step-up MFA for OWNER actions
- **Spec:** TOTP enrollment (`users.totp_secret_encrypted` AES-256-GCM with SESSION-derived key or external KMS flag),
  required on: approval.decide by OWNER/CTO, settings:write routes, key rotate. Endpoint `/auth/mfa/setup|verify`;
  rate-limited verify attempts (lockout 5 min after 5 fails, audited).
- **Tests:** enable→protected route demands mfa token→verify passes→wrong code×5 locks.

## Step E3 — Directory sync (SCIM-lite, flag-gated)
- **Spec:** `FEATURE_SCIM` bearer-token endpoint subset: GET/POST/PATCH /scim/v2/Users mapping to users table
  role assignment; deactivation revokes user's api_keys. Full compliance NOT claimed — document scope honestly.
- **Tests:** provisioning→patch role→deactivate revokes keys (audit entries verified).

## Step E4 — Tenant quotas
- **Files:** budgets extension or new quotas table (`org_id, resource[dispatch/day|storage_mb|projects], limit`),
  enforcement points: delivery.dispatch (per-org daily dispatch counter), projects.create, repos size check post-delivery;
  metrics gauge per quota usage; 402-style error code QUOTA_EXCEEDED.
- **Tests:** hit project quota → 403 QUOTA_EXCEEDED + event; dashboard Settings shows usage.

## Step E5 — Data export & erasure (GDPR-aligned)
- **Spec:** `POST /api/v1/org/export` (settings:write) → signed URL-less streaming JSON of org-owned tables
  (tasks, knowledge, audit slice) ; `POST /api/v1/org/erase-request` → cascading anonymize (actor ids → hashed tombstones)
  preserving audit chain integrity (append erasure event instead of deletion). Both audited critical.
- **Tests:** export contains all owned rows; erase preserves chain validity (`/audit/verify` true post-erase).

### PHASE E EXIT CRITERIA
- [ ] Human SSO+MFA live behind flags; machine keys governed; quotas+erasure auditable.
- [ ] Tag `upgrade/phase-e-complete`.

---

# 7. PHASE F — PRODUCT COMPLETION

## Step F1 — GitHub two-way sync
- **Spec:** push managed repo to `project.repo_url` after successful merge (branch main + tags) using GitHubAdapter
  (token flag-gated); PR option per-project setting (push branch agency/… → PR via createPullRequest);
  inbound webhook `/integrations/github/webhook` verifying x-hub-signature-256 (HMAC webhook secret) updating
  project.sync_state. Failures → retryable job `github_sync` (DLQ visible).
- **Tests:** adapter-level with fetch stub; signature reject case; sync job retry path.

## Step F2 — Deployment executor (staging real, production gated)
- **Spec:** staging deploy = compose service action via SSH/docker adapter interface (implementable no-op driver +
  docker driver), deployment_events timeline real; production stays record+approval-only until operator wires driver
  (explicit config `DEPLOY_EXECUTOR=none|docker`). Rollback invokes previous version redeploy through same executor.
- **Tests:** none-driver records identically to today; docker driver unit with fake shell out; rollback path creates executor call sequence assertions.

## Step F3 — Vector knowledge (pgvector)  [FEATURE_VECTOR_KNOWLEDGE on]
- **Spec:** pg profile migration 0008 (CREATE EXTENSION vector; embedding column 1536 dim on knowledge_chunks),
  embed-on-write when provider configured (router FAST tier), cosine search route `/knowledge/search?mode=semantic`,
  graceful LIKE fallback. SQLite profile keeps flag off (documented).
- **Tests:** insert→search relevance order (stubbed embeddings deterministic vectors); fallback intact without pg.

## Step F4 — Notifications fanout
- **Spec:** consumer on domain events (approval.requested, delivery.completed/blocked, WebhookFailed, SecurityFindingCreated)
  → notifications rows; dashboard bell endpoint `GET /notifications` + mark-read; digest option daily.
- **Tests:** trigger matrix produces expected notification rows; unread counts correct.

## Step F5 — Dashboard hardening + Playwright CI
- **Spec:** CSP meta/header on static server; token storage review (memory+refresh pattern, no localStorage persistence
  of long-lived keys); Playwright e2e suite (login→project→task→dispatch→delivery page reflects completion via SSE)
  running headless in ci.yml (webServer bootstraps control plane on ephemeral port with seeded admin).
- **Acceptance:** suite green both OS matrix; screenshots on failure archived as artifacts.

## Step F6 — Version single-sourcing  [Fixes F-17]
- **Spec:** build-time define: dashboard vite `__APP_VERSION__` from package.json; control-plane reads package.json
  version at boot (fs read, cached) replacing literal at app.ts:175; release script asserts tag==version==changelog head.
- **Tests:** meta endpoint equals package.json version; mismatch release-checklist script exits 1.

### PHASE F EXIT CRITERIA
- [ ] External VCS + real staging deploys + semantic knowledge + notifications + hardened UI + single version truth.
- [ ] Tag `upgrade/phase-f-complete` → candidate v1.0.0-rc.1

---

# 8. FINAL CERTIFICATION (before v1.0.0)

Run the full gauntlet; ALL must be green:

1. `npm run lint && npm run typecheck && npm run test:cov` (thresholds met)
2. Full e2e: seed → org/project/task/spec → dispatch → SSE observe all stages → receipt+SBOM+handoff verified
   → webhook delivered (receiver stub) → audit `/verify` valid → metrics show `agencyos_delivery_runs_total{result="succeeded"} ≥1`
3. Chaos drill: kill worker mid-run (SIGKILL) → restart → stale job reclaimed → delivery completes exactly once.
4. Fault-injection self-heal demo (dev mode) → converged path green.
5. Security regression pack: A1–A7 tests + RBAC matrix + tamper detection + CORS/MFA negative tests.
6. Load sanity: scripts/load-test.mjs 15min @ target RPS, p95 < 250ms API, zero dead letters unrelated to injected failures.
7. Docs refreshed: README status, CHANGELOG (SemVer minor bumps per phase), KNOWN-LIMITATIONS honest update
   (remaining items: SCIM subset, prod deploy driver default none, etc.), UPGRADE-BLOCKERS empty or accepted.
8. Release: tag v1.0.0, signed changelog, SBOM attached, PRODUCTION-CERTIFICATION-REPORT regenerated.

---

# 9. PER-STEP REPORT TEMPLATE (output after EVERY step)

```
STEP <ID>: <title>
STATUS: DONE | BLOCKED(<cause>)
COMMITS: <shas>
TESTS ADDED: <n> (<names>)
VERIFICATION LOOP: lint ✓ typecheck ✓ tests <pass>/<total>
ACCEPTANCE: <criterion 1> ✓ | <criterion 2> ✓ ...
DOCS TOUCHED: <files>
NOTES/RISKS: <one-liner>
```

# 10. HARD FAILURE CONDITIONS (abort & escalate if ever true)
- Any test regresses from passing→failing and cannot be fixed within the step.
- A migration would need editing after being applied anywhere.
- Secret material appears in logs, responses (beyond one-time key creation), or repo.
- Audit chain becomes unverifiable at any point.
- Deterministic gates could be weakened by advisory/LLM output (B2 invariant violated).

— END OF MASTER PROMPT — Execute with discipline. Ship v1.0.0.