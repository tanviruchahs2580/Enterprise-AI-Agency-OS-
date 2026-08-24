# PERFORMANCE REPORT

Date: 2026-08-24 · Host: local Windows (dev machine) · Tool:
`scripts/perf-baseline.mjs` against live control plane (SQLite, NODE_ENV=local)

## Baseline results (700 requests, 0 errors)

| Endpoint | n | p50 | p95 | p99 | Success |
|---|---|---|---|---|---|
| GET /health | 200 | 15.1ms | 16.6ms | 17.3ms | 100% |
| GET /api/v1/projects | 200 | 15.3ms | 17.2ms | 17.9ms | 100% |
| GET /ready | 100 | 15.1ms | 16.3ms | 16.6ms | 100% |
| POST /api/v1/projects | 100 | 15.4ms | 17.6ms | 20.5ms | 100% |

## Interpretation

- All endpoints are far inside the blueprint's 200ms p95 reference SLO
  (~12× headroom) on modest hardware with the SQLite driver.
- POST latency includes full validation + audit hash-chain append — the chain
  does not create measurable hot-path cost at this scale.

## Concurrency evidence

- Job claims use atomic conditional UPDATE — parallel `processOne()` calls cannot
  double-execute (unit-tested claim semantics).
- Optimistic locking proven under parallel API transitions (e2e: one 200/one 409).

## Resource notes

- Node process RSS during test runs stayed < 150MB.
- SQLite WAL keeps writers short; busy_timeout 5s guards contention.

## Known limits (not benchmarked here)

- Multi-writer PostgreSQL throughput (driver pending — ROADMAP v0.2).
- SSE fan-out beyond hundreds of concurrent clients (in-process bus).
- Load-test harness for sustained soak (k6-style) is ROADMAP v0.2; this report is
  a baseline, not a capacity certificate.
