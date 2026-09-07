# Tech-Debt Register v1.0

| | |
|---|---|
| **Document** | `docs/governance/registers/tech-debt.md` |
| **Version** | v1.0 |
| **Owner** | Orchestrator, **Accountable: Principal** |

| ID | Description | Location | Cost if ignored | Priority | Ticket | Status |
|---|---|---|---|---|---|---|
| TD-001 | `enterprise-feature` was sequential (10 stages, 9 agents) → 15 idle | `workflow.ts:38` (pre-redesign) | Rework, slow throughput | **High** | — | **Fixed locally** (13 stages, 6 fan-outs, 23/24) |
| TD-002 | `TOOL_RISK` missing 6 tools (governance blind) | `agents.ts:173` | Permission bypass | **High** | — | **Fixed locally** (25/25) |
| TD-003 | `adversarial-reviewer` in no workflow | `workflow.ts` + templates | Spec drift untested | **Med** | — | **Fixed locally** (dual review fanOut) |
| TD-004 | Large chunks / dashboards un-split | `apps/dashboard` build | Slow load, CI cache | Low | PROJ-### (Phase 3) | **Open** |
| TD-005 | `hotfix` single-axis review, no QA | `workflows/hotfix.yaml` | Hotfix escapes | **Med** | — | **Fixed locally** |
| TD-006 | No `CODEOWNERS` / PR template | repo root | Review gaps, large PRs | Med | PROJ-### (Phase 3) | **Open** |

## Process

- Add debt as `TD-###` at creation time (one concern per PR — Hard Rule 6).
- Prioritize by carrying cost × fix effort; top debt → next sprint.
