# Delivery Ops v1.0 — Sprints + RAG

| | |
|---|---|
| **Document** | `docs/delivery/sprint-template.md` + `rag-template.md` |
| **Version** | v1.0 |
| **Owner** | Orchestrator (captain) |

## 1. Cadence — 2-week sprints

| Ceremony | Owner | Artifact |
|---|---|---|
| **Planning** | Orchestrator | `sprint-###.md` (goal + `PROJ-###` committed + estimate) |
| **Async standup** | All | Daily log in `sprint-###.md` |
| **Review / Demo** | PM | Demo protocol + recording |
| **Retro** | Orchestrator | Actions → tickets `PROJ-###` |

## 2. Weekly RAG report (client comms, D13)

**Template `docs/delivery/rag-YYYY-Www.md`:**

```
RAG: Green/Amber/Red
Done this week: ...
Next week: ...
Risks & blockers: ... (→ RISK-###)
Metrics snapshot: coverage %, DORA (freq/lead/MTTR/failure), defect escape, cycle time
```

## 3. Release notes (D11)

Per `vX.Y.Z`: `CHANGELOG.md` (Keep a Changelog) + `sbom-vX.Y.Z.json` + runbook link.

## 4. Escalation matrix

| Level | Who | SLA |
|---|---|---|
| L1 | Orchestrator | 4h |
| L2 | Principal | 24h |
| L3 | Human founder | Same day (finops SLA) |

## 5. Exit (Done when)

Two consecutive sprints with all artifacts + metrics (Hard Rule, §11).

## Change log

- v1.0 — sprint + RAG + escalation
