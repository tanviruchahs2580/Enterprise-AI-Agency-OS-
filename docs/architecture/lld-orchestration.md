# LLD v1.0 — Orchestration Module

| | |
|---|---|
| **Document** | `docs/architecture/lld-orchestration.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | Staff Eng + Architect |
| **HLD** | `docs/architecture/hld.md` |

## 1. Boundary

- **Path:** `packages/orchestration/src/*` — pure, no I/O, no `apps/` imports.
- **Exports:** `AGENT_ROSTER`, `CAPABILITY_IDS`, `CapabilityRouter`, `WorkflowEngine`, `MissionCompiler`, `computeReachability`, `validateHandoff`, `hashContent`.

## 2. Agent contracts

- **Source:** `agents.ts:82` — 24 `AgentDefinition` (12 fields). `tierBudget` maps REASONING/SECURITY/REVIEW $8, STANDARD $6, FAST $4. `TOOL_RISK` now 25/25 (gap closed).
- **Seeding:** `registry.ts:18` transactional UPSERT — idempotent, re-syncs on every boot/org create.

## 3. Workflow engine (ADR-0005)

- **Types:** `WorkflowStageDef` (`workflow.ts:5`) — `name`, `agentRole`, `approvalRequired`, `retry`, `timeoutMs`, `lowRiskSkip`, `fanOut: WorkflowStageDef[]`.
- **DEFAULT_WORKFLOW `enterprise-feature`:** 13 stages + 6 fan-outs (17 branches) — see `workflow.ts:38`. `advance` + `advanceFanOut` converge via `Promise.all`; `completedStages = stages + branches` (30).
- **Risk pruning:** `lowRiskSkip` stages skipped on `riskTier=low`.
- **Persistence:** `workflow_runs.state_json` encrypted via `OrgKeyEncryption`.

## 4. Deterministic primitives

- **MissionCompiler:** `mission.ts` — complexity/risk/capabilities from keywords, deterministic.
- **CapabilityRouter:** `routing.ts:58` — coverage 40 + tool 30 + tier 30 + risk-aware 10 + preferred 20.
- **Reachability:** `coverage.ts:34` — skill / workflow / capability paths, deduped.

## 5. Tests

- `packages/orchestration/test/workflow.test.ts`, `workforce.test.ts`, `orchestration.test.ts` — part of 235.
