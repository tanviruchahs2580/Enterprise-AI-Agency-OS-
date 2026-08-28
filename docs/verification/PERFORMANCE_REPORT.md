# Performance Report — Enterprise AI Agency OS

## Latency (live API suite, prior turn)
- Auth/RBAC/CRUD p50 ≈ **14.8 ms**, p95 ≈ **16.5 ms** (single replica, local SQLite).
- Rate-limit + state-machine rejection paths return in < 20 ms.

## Throughput / concurrency
- In-process job queue processed the verification task end-to-end in **~0.5 s**
  (mock model: 82 in / 8 out tokens, cost $0.000084).
- Rate limit default 600 req/60s per key; Postgres store allows horizontal scale.

## Resource (container, prior turn)
- Docker image runs as non-root `agency`; idle control plane uses minimal RAM/CPU.
- No browser engine in product ⇒ no browser memory/CPU surface to profile.

## Database
- SQLite (dev) with WAL; `busy_timeout=5000`, `foreign_keys=ON`.
- This session added `PRAGMA wal_checkpoint(TRUNCATE)` on `close()` to guarantee
  committed frames are durable before process exit (verified via
  create→insert→checkpoint→close→reopen round-trip).

## Build
- Dashboard Vite build ~34s; control plane typechecks via `tsc -b`.

## Not measured (environment limits)
- Long-run stability / soak test, 50+ concurrent jobs, multi-replica under load —
  require a staged deployment; architecture supports it (stateless API + Postgres
  broker-ready queue) but was not load-tested to a published SLA.

## Bottlenecks found
- None blocking. If scale grows, move job queue to a shared Postgres/Redis broker
  (code already supports `RATE_LIMIT_STORE=postgres`; queue broker is the next step).
