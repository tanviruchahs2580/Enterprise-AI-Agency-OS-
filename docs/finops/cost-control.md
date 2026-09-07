# FinOps v1.0 — Token Metering + Budget Caps (SY-04)

| | |
|---|---|
| **Document** | `docs/finops/cost-control.md` |
| **Version** | v1.0 |
| **Owner** | FinOps (finops-agent) |

## Metering

- Per `run / stage / agent`: `cost_usd`, `tokens_in/out` in `executions` + `workflow_runs` (routed via `model-router`).
- **Per-run cap:** `budgetUsd` from `tierBudget` ($4/$6/$8); exceed → `BUDGET_EXCEEDED` 402 + audit `budget.exceeded`.

## Controls

- **Runaway kill-switch:** `maxIterations` (principal 10, captain 40) + `timeoutMs` 600s; loop > budget → `TOOL_RISK` `budget_exceeded` in `SkillRuntime`.
- **Monthly report:** `docs/finops/report-YYYY-MM.md` from `cost_events` (auto-generated).

## Change log

- v1.0 — metering + caps + report
