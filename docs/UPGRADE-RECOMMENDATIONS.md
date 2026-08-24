# UPGRADE RECOMMENDATIONS

Prioritized per Phase 38 classification. Only material improvements listed.

## P1 (next release train — v0.2)

| Item | Rationale | Effort |
|---|---|---|
| PostgreSQL driver implementation behind `DatabaseDriver` | Production multi-writer requirement; interface + schema already portable | M |
| Git worktree execution loop + PR flow via GitHub adapter | Completes the implement→review→merge lifecycle promised by agent contracts | L |
| Prometheus `/metrics` endpoint (prom-client) | Current metrics live in DB/API only; scrape endpoint closes the observability loop with shipped compose stack | S |
| Reviews API surface (`reviews`, `gate_results` tables already exist) | Two-axis review agents need persistence endpoints | M |

## P2

| Item | Rationale |
|---|---|
| vite@8 major upgrade | Clears accepted esbuild dev-server advisory; no runtime impact today |
| Externalize rate-limit & SSE bus to Redis | Required before multi-replica horizontal scaling |
| Approval expiry sweeper job | Expired rows currently flip on read; periodic sweep keeps dashboards exact |
| Cursor pagination for remaining list endpoints | Standard exists for tasks; apply uniformly |

## P3 / Future (tracked in ROADMAP.md)

OIDC identity provider adapter · vector knowledge retrieval · browser automation
provider · Helm chart · k6 soak-test suite in CI nightly.

## Explicitly NOT recommended now

- Microservice split of control-plane (single-process is a feature at this scale)
- Additional orchestration frameworks (LangGraph et al.) — engine is deterministic
  and tested
- Any ORM adoption — driver abstraction already isolates SQL
