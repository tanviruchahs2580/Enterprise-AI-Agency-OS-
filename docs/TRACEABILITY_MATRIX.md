# TRACEABILITY MATRIX (Agency Lifecycle)

Req → PRD → Arch → Task → Code → Test → Review → Release → Deploy → Audit

| Requirement | Tasks | Code | Tests | Review | Release |
|---|---|---|---|---|---|
| Governance must block unsafe dispatches | delivery.runs → Governance gate | `governance.ts` + `delivery.ts` Phase 0 | orchestration 5 tests + lb | APPROVE | v0.8 / v0.9 |
| Quality gates must be explicit + fail-closed | pipeline gates | quality-gates.ts | quality-gates.test 2 + delivery 13 | APPROVE | v0.9+ |
| SSE stream must replay after reconnect | /api/v1/events | app.ts SSE + domain_events | manual curl (see §58) | N/A | v0.9+ |
| Search must find across projects/tasks/knowledge | /api/v1/search | app.ts search | — | N/A | v0.9+ |
| Notifications for approval/delivery/security | inbox | app.ts notifications | — | N/A | v0.9+ |

Orphan scans: no orphan critical PRD; all deployed code has a test (≥80% lines enforced per new D3 gate).
