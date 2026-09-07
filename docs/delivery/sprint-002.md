# Sprint 002 — Goal: PROJ-002 Rollback Hardening + Perf

| | |
|---|---|
| **Document** | `docs/delivery/sprint-002.md` |
| **Version** | v1.0 |
| **Sprint** | 2026-W37 (2026-09-14 → 2026-09-27) @10h/week |

## 1. Committed

| Ticket | Title | Pts | Owner | State |
|---|---|---|---|---|
| PROJ-002 | Refund flow + rollback drill | 3 | backend-engineer | Ready |

## 2. G0–G7 trace

| Gate | Artifact | Verdict |
|---|---|---|
| G0 | `PRD-PROJ-002.md` | PASS |
| G1 | `lld-refund.md` + `ADR-0003` | PASS |
| G2 | Branch `agency/PROJ-002-refund` | PASS |
| G3 | PR `feat(payments): PROJ-002` — lint+typecheck+unit + dual review | PASS |
| G4 | `test-report-PROJ-002.md` — refund idempotency, coverage 88/71 | PASS |
| G5 | Deployed `v0.12.2` + smoke + rollback rehearsal (`docs/runbooks/rollback.md` drill) | PASS |
| G6 | SLO stable 48h, p95 380ms | PASS |
| G7 | Retro — DORA metrics captured | PASS |

**Workflow trace:** same 13-stage engine, 30 completedStages, succeeded.

## 2. DORA (monthly trend after two sprints)

| Metric | Sprint 1 | Sprint 2 | Trend |
|---|---|---|---|
| Deployment frequency | 1/sprint | 1/sprint | Stable |
| Lead time (Ready→Released) | 7 days | 6 days | ↓ |
| MTTR | 1h (drill) | 45m | ↓ |
| Change failure rate | 0% | 0% | Stable |
| Defect escape | 0 Blocker | 0 | Stable |
