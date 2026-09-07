# QA SOP v1.0 — Test Plan → Cases → Report

| | |
|---|---|
| **Document** | `docs/qa/test-plan.md` |
| **Version** | v1.0 |
| **Owner** | QA (qa-engineer), **Accountable: QA (G4)** |

## 1. Gates

| Gate | Rule | Enforcement |
|---|---|---|
| **Coverage** | Core ≥70% unit; **touched ≥80% line / ≥60% branch** (`coverage-gate-80-60` skill) | `POST /tasks/:id/receipt` checks `coverageLine/Branch` — **enforced Phase 5** (was stored-only GAP-003) |
| **Contract** | Every `openapi.yaml` path has contract test (status + error envelope) | CI `npm test` includes `contract-*.test.ts` |
| **e2e** | Top-5 journeys: login→project→task→workflow→deploy (Playwright) | `playwright test` in CI |

## 2. Traceability (P2)

`PRD AC (Given/When/Then)` → `PROJ-###` → `cases/PROJ-###.md` → `test-*.ts` → `evidence_records(type=test-result)` → `test-report-PRJ-###.md` + sign-off.

## 3. Defect lifecycle

`Severity: Blocker/Critical/Major/Minor × Priority: P0/P1/P2` → `failed` → `blocked` → fix PR `PROJ-###` → re-test. **No CAP the gate.**

## 4. Load + WCAG (NFRs)

- **k6** baseline in `k6/` vs `nfr-register.md` (p95 500ms, 10k rps) — `performance-engineer` in `qa` fanOut.
- **WCAG 2.1 AA** — `browser.session` + `tests.e2e` (frontend fanOut + `ux-designer` a11y checklist).

## 5. Exit (G4)

Gates in CI; `docs/qa/test-report-PRJ-###.md` + QA sign-off per release.
