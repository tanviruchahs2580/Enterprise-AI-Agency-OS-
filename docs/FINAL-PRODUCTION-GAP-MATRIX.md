# FINAL PRODUCTION GAP MATRIX

Created before implementation (2026-08-24). Baseline: `main @ 91e25ef` (v0.1.1).
Statuses updated as each item is verified. Classification: BLOCKER / P0 / P1 / P2 / FUTURE.

| ID | Requirement | Current State @v0.1.1 | Risk | Priority | Implementation Required | Test Required | Verification Status |
|---|---|---|---|---|---|---|---|
| G-01 | PostgreSQL production driver | Driver interface exists; PG throws NotInstalled | HIGH (prod DB blocker) | P0 | `pg`-backed driver, portable SQL migrations, pooling, same facade | Live PG migration + CRUD + optimistic lock | PASS |
| G-02 | Prometheus `/metrics` | absent | MEDIUM (ops blind spot) | P0 | Dependency-free text-format endpoint: http/queue/router/approval/db gauges+counters | scrape + assert series present | PASS |
| G-03 | Approval sweeper | expiry checked only on read | MEDIUM (stale PASS rows) | P1 | periodic sweeper marking expired + audit events | unit: expiredâ†’expired w/ audit row; idempotent re-run | PASS |
| G-04 | Stale worker reclaim (crash recovery) | running jobs stuck forever on crash | HIGH (job loss on crash) | P0 | locked_at-based reclaim to PASS | unit: stale reclaimed, fresh untouched; concurrent double-claim impossible | PASS |
| G-05 | Concurrent job claim proof | atomic UPDATE by design | MEDIUM | P0 | explicit parallel claim race test | 2 workers Ã— N jobs â†’ no double execution | PASS |
| G-06 | SSE auth hardening | long-lived API key in query param | LOW-MEDIUM (key leakage) | P1 | one-time short-TTL tickets (`POST /events/ticket`); drop raw key from URL | ticket flow e2e; reuse/expiry rejected; dashboard updated | PASS |
| G-07 | Rate-limit key hardening | bearer-prefix bucket key (collision-prone) | LOW | P1 | hash(keyId\|ip) identity-aware buckets | unit: distinct keys per identity; reset window works | PASS |
| G-08 | Reviews API | table exists, no routes | LOW-MEDIUM (workflow gap) | P1 | POST/GET task reviews w/ axis+verdict+findings, audit-linked | e2e create/list + RBAC denial | PASS |
| G-09 | Git worktree isolation loop | sandbox exists; worktree service absent | MEDIUM (agent delivery loop) | P1 | GitWorktreeService: branch/worktree createâ†’execâ†’diffâ†’cleanup; dirty-tree guard | integration test against temp git repo; destructive-op guard | PASS |
| G-10 | Graceful shutdown / restart recovery | handlers exist | MEDIUM | P0 | restart-recovery failure-injection: kill mid-jobs â†’ reopen DB â†’ jobs recoverable | e2e-style test: close+reopen sqlite; jobs intact | PASS |
| G-11 | DB-unavailable readiness | ready checks db | LOW | P1 | failure injection: closed driver â†’ ready 503 DEPENDENCY_UNAVAILABLE | test asserts failure shape | PASS |
| G-12 | Duplicate delivery safety (webhook/exec) | exec idempotency key; webhook dedupe partial | LOW | P2 | idempotency_keys enforcement helper used by dispatch route | repeat dispatch same key â†’ single execution | PASS |
| G-13 | Clean-environment bootstrap | untested from scratch clone | MEDIUM | P1 | temp-dir clone â†’ npm ci â†’ migrate â†’ seed â†’ boot â†’ health | recorded output | PASS |
| G-14 | Container build/start verification | files shipped, BLOCKED (no Docker host) | MEDIUM | P1 | attempt install via permitted tooling; else ENVIRONMENT BLOCKED procedure | docker build/run/smoke | ENVIRONMENT BLOCKED (no Docker daemon on build host; procedure documented in DEPLOYMENT-RUNBOOK.md) |
| G-15 | Performance regression vs baseline | p95 17.6ms | LOW | P1 | re-run perf-baseline post-changes | p95 â‰¤ 200ms target | PASS |
| G-16 | Backupâ†’restore drill (fresh) | verified in v0.1.1 | LOW | P1 | re-run on final schema | row-equality proof | PASS |
| G-17 | Multi-replica unsafe state audit | rate-limits/SSE/breakers in-proc | MEDIUM | P1 | document durable-vs-local state; ensure nothing correctness-critical is local-only | code audit section in report | PASS |
| G-18 | Distributed queue infra (Redis etc.) | not required until multi-replica | â€” | P2 | defer: DB-backed queue already atomic & multi-worker safe | covered by G-04/G-05 | DEFERRED |
| G-19 | Worktreeâ†’PR GitHub flow live | adapter exists behind flag | LOW | FUTURE | needs real repo+token scope | â€” | FUTURE |

Non-goals (explicitly out of scope): feature expansion beyond operability; UI redesign; new agent roles.
