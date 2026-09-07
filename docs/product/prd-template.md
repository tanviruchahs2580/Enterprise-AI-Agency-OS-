# PRD Template — Agency OS Feature

| | |
|---|---|
| **Document** | `docs/product/prd-template.md` |
| **Version** | v1.0 |
| **Owner** | PM (product-manager), **Accountable: Human (G0)** |

> Copy to `docs/product/PRD-PRJ-###.md` per feature. The `srs-authoring` + `acceptance-criteria` skills consume this file.

---

## 1. Summary (1 paragraph)

- **Problem:** 
- **User:** 
- **Outcome (measurable):** 
- **Non-goal:** 

## 2. Stories (PM decomposes → `PROJ-###` stories)

| Story ID | As a … | I want … | So that … | Priority (MoSCoW) |
|---|---|---|---|---|
| ST-001 | | | | Must |
| ST-002 | | | | Should |

## 3. Acceptance criteria (per story, `Given/When/Then` + DoR)

**Story ST-001:**
- **Given** … **When** … **Then** … (happy path)
- **Given** … **When** … **Then** … (edge case)
- **DoR check:** testable? dependencies named? size ≤5 pts? NFR flagged?

AC skill: `acceptance-criteria` produces `criteria[] + ready:boolean + warnings[]`. `ready=true` only when 0 warnings.

## 4. Scope & constraints

- In-scope: 
- Out-of-scope: 
- Constraints (NFRs): perf p95 / avail % / RTO/RPO / scale / compliance

## 5. NFR register (link to `docs/architecture/nfr-register.md`)

| NFR | Target | Measurement |
|---|---|---|
| p95 latency | 500ms | k6 baseline |
| Availability | 99.9% | SLO |
| Scale | 10k rps | load test |

## 6. Estimation (reference-task calibration)

| Story | Points | Reference | Risk |
|---|---|---|---|
| ST-001 | 3 (M) | `POST /tasks/:id/receipt` validation | low |

## 7. Handoff

- **Next:** Architect at G1 (design pack). Link: `PRD-PRJ-###` → `knowledge_documents(kind=requirements)` + `PROJ-###` ticket.

---

## Estimation addendum (reference tasks, frozen after G1)

- **S (1 pt):** fix typo in README — 2h, 1 file.
- **M (3 pts):** `POST /tasks/:id/receipt` validation — 1 day, 2 files.
- **L (5 pts):** multi-currency payments slice — 5 days, 5+ files.
- **Scale** 1,2,3,5,8 — **8+ must be decomposed**.
