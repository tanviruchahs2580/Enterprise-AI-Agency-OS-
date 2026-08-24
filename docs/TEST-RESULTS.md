# TEST RESULTS

Date: 2026-08-24 · Runner: `node --test` (Node v24.19.0, win32)

## Summary

| Suite | Files | Tests | Pass | Fail |
|---|---|---|---|---|
| core unit | 1 | 6 | 6 | 0 |
| db unit | 1 | 3 | 3 | 0 |
| security unit | 1 | 4 | 4 | 0 |
| models unit | 1 | 5 | 5 | 0 |
| orchestration unit | 1 | 8 | 8 | 0 |
| control-plane e2e (API + worker + tenancy) | 1 | 17 | 17 | 0 |
| mcp contract (child process over stdio) | 1 | 1 | 1 | 0 |
| **Total** | **7** | **43+1 boot** | **43** | **0** |

CI cross-check: GitHub Actions `ci.yml` run 32746089979 — **SUCCESS** on
ubuntu-latest and windows-latest (lint → typecheck → tests → dashboard build →
self-test → production-gate logic).

## Coverage (`node --test --experimental-test-coverage`, packages under test)

| Metric | Value | Gate |
|---|---|---|
| Line | **90.86%** | ≥80% PASS |
| Branch | **80.56%** | ≥60% PASS |
| Functions | 76.26% | informational |

Weakest files (improvement candidates): `sandbox.ts` 69.8% lines (docker branch
untestable locally), `registry.ts` 69.8% (list/get error paths).

## Meaningfulness review (Phase 7)

- No mock-only tests: model tests exercise the real router/breaker code with a
  deterministic provider; e2e boots the real Fastify app against a temp SQLite DB.
- Failure paths asserted: budget block before any provider call; breaker
  open→half-open→closed; approval expiry; optimistic-lock conflict; migration
  tamper detection.
- Skipped/disabled tests: none.

## New regression tests added during this verification

1. Tenant isolation across two organizations
2. Worker execution end-to-end (dispatch→artifact→cost scopes→task transition)
3. Deployment rollback trail
4. Approval timeout/expiry enforcement
5. Concurrent task transition (exactly-one-winner)
6. Missions/workstreams endpoints
