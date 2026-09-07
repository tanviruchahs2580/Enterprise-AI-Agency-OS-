# NFR Register v1.0

| | |
|---|---|
| **Document** | `docs/architecture/nfr-register.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | SRE + Architect, **Accountable: Human (G1)** |

| NFR | Target | Measurement | Owner | Gate |
|---|---|---|---|---|
| **p95 latency** (dashboard queries) | 500ms | k6 baseline + `agencyos_build_info` metrics | SRE / Performance Eng | G4 QA |
| **Availability** | 99.9% | SLO `availabilityTarget` in `srePostDeployCheck` | SRE | G6 |
| **RTO / RPO** | 1h / 5min | Restore drill report (Phase 8) | DBA / SRE | G6 |
| **Scale ceiling** | 10k rps dashboard, 100 concurrent agents | k6 `perf-benchmark` (qa fanOut) | Performance Eng | G4 |
| **Defect escape rate** | <5% | Defect log vs releases | QA | G4 |
| **Coverage** | ≥70% unit core; 80/60 on touched (enforced Phase 5) | `coverage-gate-80-60` skill + CI | QA | G3→G4 |
| **WCAG** | 2.1 AA on UI | `browser.session` + `tests.e2e` (frontend fanOut) | Frontend + UX | G4 |

## Change log

- v1.0 — initial NFRs
