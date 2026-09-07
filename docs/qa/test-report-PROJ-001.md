# Test Report — PROJ-001

| | |
|---|---|
| **Document** | `docs/qa/test-report-PROJ-001.md` |
| **Version** | v1.0 |
| **Ticket** | `PROJ-001` |
| **Owner** | QA (qa-engineer), **Accountable: QA (G4)** |

## 1. Traceability

| AC (PRD) | Case | Test |
|---|---|---|
| ST-001 SAR charge | `cases/PROJ-001-SAR.md` | `payments.test.ts: charge SAR` — passed |
| ST-001 JPY + i18n | `cases/PROJ-001-JPY.md` | `localization.test.ts` + `e2e: locale JA` — passed |
| ST-002 USD conversion p95 | `cases/PROJ-001-USD.md` | `k6: p95 420ms` — passed |

## 2. Coverage

- **Touched:** 84% line / 67% branch — **PASS** (≥80/60)
- **Core:** 72% unit — PASS (≥70)

## 3. Execution

- Unit 235/235 + contract `openapi.yaml#/payments` + e2e `locale JA` smoke — **PASS**
- Defects: 0 Blocker/Critical; 1 Minor (RTL padding, P2 → PROJ-003)

## 4. Sign-off

QA sign-off: **PASS** at G4.

## 5. Evidence

- `evidence_records: test-result` (hash-verified), `skill_executions` `tdd-red-green-refactor` success.
