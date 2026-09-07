# Architecture Inventory — Phase 0 (Master Prompt §85)

**Baseline:** `v0.13.1 @ cf7728e` — 24 agents, 8 skills, 4 workflows, fan-out, 13-stage enterprise-feature (30 steps), 235 tests, 48/48 live, `TOOL_RISK` 25/25.

**Existing planes (to evolve, not discard):**

- **Control:** MissionControl (compile) → MissionCompiler → CapabilityRouter → WorkflowEngine → TaskGraph (WorkGraph) → AgentRegistry/Contracts → Policy (TOOL_RISK) → Governance (RACI) → Approval (deploy:staging) → Risk (0.9/0.6) → Cost (tierBudget $8/$6/$4) → Audit (audit_events)
- **Execution:** ExecutionEngine (execute_task) + WorkspaceManager (data/repos) + SecureSandbox (ProcessSandbox) + Shell/FS/Git/Test/Browser/DB/CI/Deployment executors (partial) + ArtifactManager (artifacts)
- **Observation:** logs (structured), metrics (build_info/http/model/cost), traces (OTEL), test results (skill_executions), security findings (security findings), deployment health (ready), SLOs (stubs), telemetry (cost_events), anomaly (none)
- **Knowledge:** project memory (projects/tasks), architecture (ADRs), decision (decision.md), requirement (PRDs), failure (delivery_stages), incident (none), review (reviews), deployment (deployments), cost (budgets), codebase (none), handoff (agent_handoffs), evidence (evidence_records) — semantic boundaries preserved via `kind` field

**Gaps to target (§3-4):** 12 executors (Browser/DB/CI/Deployment partial) → must be 12 explicit; Observation missing anomaly/incident signals, SLO loop stub; Knowledge missing codebase graph, handoff graph explicit; AgentContract V1 (12 fields) → V2 (24 fields §5); Authority model (§7) currently implicit → explicit Policy→Workflow→Execution→Verification chain; Dynamic permissions (§8) static only; No RepositoryIntelligence (§11) / CodeGraph (§12) / ContextIntelligence (§13) / ImpactAnalysis (§14) / FanOut V2 per-branch state (§18) / Checkpoint per-tool (§19) / IntegrationEngine (§26) / FailureIntelligence (§28) / VerificationEngine (§31) / EvidenceGraph (§33) / ConformanceEngine (§61) / Chaos (§66) etc.

**Reuse:** Keep 24-agent routing, skill runtime hooks, fan-out engine, encrypted workflow state — refactor, not duplicate.

**Inventory hash:** `cf7728e` — next Phase 1 will add V2 contracts + 4-plane schemas.
