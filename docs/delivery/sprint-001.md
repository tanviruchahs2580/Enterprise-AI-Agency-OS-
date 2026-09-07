# Sprint 001 — Goal: PROJ-001 Multi-Currency Slice (M, 3 pts)

| | |
|---|---|
| **Document** | `docs/delivery/sprint-001.md` |
| **Version** | v1.0 |
| **Sprint** | 2026-W36 (2026-08-31 → 2026-09-13) @10h/week |
| **Goal** | Deliver PROJ-001 to Released (G5) with all gates |

## 1. Committed

| Ticket | Title | Pts | Owner | State |
|---|---|---|---|---|
| PROJ-001 | Multi-currency payments slice | 3 | backend-engineer (lead) | Backlog→Ready (DoR pass) |

## 2. G0–G7 trace (P2)

| Gate | Artifact | Verdict | Evidence |
|---|---|---|---|
| **G0 Discovery** | `PRD-PROJ-001.md` v1.0 | **PASS** | Human approved G0 |
| **G1 Design** | `lld-payments.md` + `ADR-0002` + `openapi.yaml` patch (`/payments` `currency` enum) | **PASS** | Human+Critic (C4 + threat model) |
| **G2 Planning** | Branch `agency/PROJ-001-payments`, estimate 3 | **PASS** | Human |
| **G3 Build** | PR `feat(payments): PROJ-001 — multi-currency` — lint+typecheck+unit 235/235 + contract test + `review: approved` (both axes) | **PASS** | Tech Lead |
| **G4 QA** | `docs/qa/test-report-PROJ-001.md` — AC traceable, coverage 84/67, k6 p95 420ms, WCAG AA | **PASS** | QA |
| **G5 Release** | Deployed staging `v0.12.1-rc1` + smoke green + rollback ready + `sbom-v0.12.1-rc1.json` | **PASS** | Human+DevOps |
| **G6 Operate** | SLO stable 48h (simulated: metrics `p95 420ms <500`) + runbook | **PASS** | SRE |
| **G7 Retro** | Metrics reviewed; TD-004 → PROJ-003 | **PASS** | Orchestrator |

**Workflow trace (13-stage engine):** `discovery(3 fanOut) → requirements → architecture(4) → planning(2) → approval(principal) → implementation(4: backend/frontend/localization/staff) → review(2) → security → qa(2: coverage/perf) → documentation → release → deployment → monitoring` — **30 completedStages, succeeded** (as traced in `enterprise-build-trace`).

## 3. Standup log (async, daily)

- 08-31: G0 pass; 09-01: G1 pass; 09-02–05: Build (backend + frontend + localization in parallel); 09-06: Dual review PASS; 09-07: QA PASS; 09-08: Release PASS.

## 4. Retro actions → tickets

- TD-004 chunk split → `PROJ-003` (Phase 3).
