# Risk Register v1.0

| | |
|---|---|
| **Document** | `docs/governance/registers/risk.md` |
| **Version** | v1.0 |
| **Owner** | Orchestrator (captain), **Accountable: Principal** |

## Active risks (seeded from Phase 0 GAPs)

| ID | Title | Category | Likelihood | Impact | Score (L×I) | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| RISK-001 | Scope creep without PRD/change-request process | Delivery | High | High | **High** | PRD template + CR log from Sprint 0; P6 escalation with ≥2 options | PM | **Open** |
| RISK-002 | Defect escape — 80/60 gate not enforced | Quality | High | High | **High** | Enforce `POST /tasks/:id/receipt` check in Phase 5; CI gate | QA | **Open** |
| RISK-003 | Credential leak — SAST/secrets not in CI, no vault | Security | Med | Crit | **High** | Phase 6: CodeQL + gitleaks + vault | Security Eng | **Open** |
| RISK-004 | `pm_decompose` never triggers — no stories | Orchestration | High | Med | **High** | App-layer enqueue (post-G1) | Orchestrator | **Open** |
| RISK-005 | Architecture drift — no HLD/LLD/ADR-0001 | Architecture | Med | High | **High** | Phase 2 HLD/LLD + MADR | Architect | **Open** |
| RISK-006 | Solo founder bottleneck (10h/week) | Delivery | High | Med | **High** | WIP=1, agent parallelism (fan-out 4×) | Orchestrator | **Accepted** |
| RISK-007 | Silent SLO breach — stubs without loop | Reliability | Med | High | **High** | Phase 7 SLO evaluation + incident SOP | SRE | **Open** |

## Closed / accepted

| ID | Title | Resolution | Date |
|---|---|---|---|
| — | TOOL_RISK 6/25 gaps | Fixed locally in `agents.ts` (8-file redesign, uncommitted) — will harden in Phase 6 | 2026-08-31 |

## Process

- Review at every sprint retro; raise new risks as `RISK-###` with L/I/Score.
- Escalate High/crit to Principal same day (finops SLA).
