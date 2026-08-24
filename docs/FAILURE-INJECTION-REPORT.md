# FAILURE-INJECTION REPORT

Scenarios executed with intentional faults. Every case asserts safe failure.

| # | Fault injected | How | Observed behavior | Verdict |
|---|---|---|---|---|
| 1 | Model provider failure (persistent) | MockProvider `failNextCalls(99)` | Router falls back across candidates; success recorded with `fallback_reason` ≠ null | PASS |
| 2 | Budget exhausted pre-flight | Guard `allowSpend→false` | `BUDGET_EXCEEDED` before ANY provider call; zero spend recorded | PASS |
| 3 | Circuit breaker cascade | 2 consecutive failures (threshold 2) | OPEN rejects fast; cooldown→HALF_OPEN; probe success closes | PASS |
| 4 | Invalid API key (provider) | Provider throws UNAUTHENTICATED | Non-retryable classification — no pointless retries | PASS |
| 5 | All candidates fail | Both providers failing | `PROVIDER_FAILURE` + requestId + attempts in details; model_requests row status=failed | PASS |
| 6 | Approval expiry (timeout) | TTL=0 approval, delayed decision | Decision rejected `CONFLICT expired`; gate stays closed (`APPROVAL_REQUIRED` on action) | PASS (bug fixed) |
| 7 | Duplicate decision | Second decide on same approval | `409 CONFLICT already decided` | PASS |
| 8 | Concurrent task transition | Two parallel transitions, one optimistic-lock version | Exactly one 200, one 409 — no lost update | PASS |
| 9 | Dependency cycle in task graph | A↔B edge attempt | Rejected with cycle error; graph unchanged | PASS |
| 10 | Migration tampering | Checksum mutated post-apply | Runner refuses with checksum-drift error | PASS |
| 11 | Destructive command at sandbox | `sh -c "rm -rf /"` | Blocked at tool layer (`FORBIDDEN destructive command blocked`) | PASS |
| 12 | Job handler crash | Flaky handler ×2 attempts | Backoff reschedule → dead_letter after max → manual requeue path works | PASS |
| 13 | Missing job payload field | Worker given malformed payload | Fails loudly into retry/DLQ instead of corrupting state (regression: was silent undefined) | PASS (fixed) |
| 14 | Unauthenticated / forged API access | Missing & wrong bearer tokens | 401 both; no stack traces leaked (error body shape asserted) | PASS |
| 15 | Cross-org data access | Org A reads B's project/knowledge/tasks | Scoped out (404/empty); no leakage | PASS |

## Not executable in this environment

| Scenario | Blocker | Compensating evidence |
|---|---|---|
| Docker daemon down mid-execution | No Docker host | `DockerSandbox.available()` probe returns false → DEPENDENCY_UNAVAILABLE raised by design; unit-level interface test |
| GitHub API outage | Requires live token+network faulting | Adapter maps HTTP 429→RATE_LIMITED, non-OK→PROVIDER_FAILURE (code-reviewed paths) |
| Database process kill | SQLite in-proc for tests | WAL mode + busy_timeout configured; Postgres runbook in DISASTER-RECOVERY.md |
