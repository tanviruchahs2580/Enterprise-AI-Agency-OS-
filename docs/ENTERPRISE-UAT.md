# ENTERPRISE UAT — SCENARIO EVIDENCE MATRIX

Each business-level scenario maps to executed, automated evidence. "Manual"
items were executed once by the engineering agent and recorded here.

| # | Scenario | Steps | Evidence (test / command) | Result |
|---|---|---|---|---|
| A | Normal workflow: project→task graph→agent dispatch→plan artifact→handoff→cost→audit | e2e WORKER EXECUTION + T1/T4 + audit verify | `apps/control-plane/test/e2e.test.ts` | PASS |
| B | Duplicate request safety | same idempotency key twice → one execution | e2e G-12 DISPATCH IDEMPOTENCY; unit job idempotency | PASS |
| C | Model failure → fallback | primary provider fails persistently | unit router fallback test (fallback_reason recorded) | PASS |
| D | Worker crash recovery | stale lock reclaim | unit G-04 stale reclaim; loop integration | PASS |
| E | Database outage degradation | driver closed mid-suite | e2e G-11 (/ready → 503 DEPENDENCY_UNAVAILABLE) | PASS |
| F | Dirty git repository protection | uncommitted change present | worktree integration test (refused) | PASS |
| G | Unauthorized action | no/wrong/revoked key; insufficient role; cross-org | e2e 401/403 set + TENANT ISOLATION + AUTHZ revoked-key | PASS |
| H | Approval expiry determinism | TTL elapsed pending approval | sweeper unit test + e2e APPROVAL TIMEOUT | PASS |
| I | Deployment failure rollback | succeed then rollback corrective row | e2e ROLLBACK | PASS |
| J | Full environment loss recovery | fresh clone → bootstrap → migrate → seed → tests | clean-env drill (recorded in PROGRESS.md); backup/restore drill row-equality | PASS |
| K | Concurrent decisions on one approval | approve+reject race | e2e APPROVAL RACE (200/409) | PASS |
| L | Context overflow safety | prompt > every model window | models unit context-overflow test | PASS |
| M | UI runtime QA (6 pages × Chromium) | real browser: render + zero console errors + zero failed requests | `scripts/ui-test.mjs` — 6/6 PASS (v0.4.0) | PASS |
| N | API edge cases | malformed JSON→400 VALIDATION_ERROR; >1MB body rejected; concurrent duplicate slug → one 201/one 409 | e2e API EDGE + DATA INTEGRITY tests (v0.4.0) | PASS |
| O | Process observability | RSS/heap/uptime gauges on /metrics | metrics registry v0.4.0 | PASS |

## UAT sign-off conditions

- All scenarios PASS on the release commit.
- Any FAIL blocks certification until fixed or explicitly documented as
  limitation with an owner.

Latest run: v0.3.0 candidate, all scenarios PASS (see
docs/PRODUCTION-CERTIFICATION-REPORT.md for the machine-generated summary).
