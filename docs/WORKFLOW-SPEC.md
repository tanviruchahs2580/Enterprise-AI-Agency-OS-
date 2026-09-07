# WORKFLOW-SPEC v1.0 — Enterprise Workflows

- `enterprise-feature` 13 stages + 6 fanOut (17 branches) → 30 completedStages, 23/24 default
- `hotfix` 7, `dependency-patch` 7, `research-spike` 6 — all fanOut V2 per-branch state
- Engine: `packages/orchestration/src/workflow.ts` (fanOut Promise.all, lowRiskSkip, checkpoints encrypted)
- State machine 12 states (§16), Task Graph DAG (§17), Handoff protocol §20

See `docs/WORKFLOW-PROJECT-BUILD-REPORT.md`.
