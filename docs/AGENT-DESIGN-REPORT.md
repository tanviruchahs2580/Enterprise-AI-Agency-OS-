# Agent Design Report — 24 Contracts V2 (Live `v0.14.1`)

**Source:** `agents.ts:13` (12 fields) + `agent-contracts-v2.ts` (24 fields: id/name/version/role/description/systemPrompt/allowedTools/forbiddenTools/modelTier/maxIterations/timeoutMs/budgetUsd/skills/verificationPolicy/preconditions/postconditions/successCriteria/failureCriteria/retryPolicy/escalationPolicy/rollbackPolicy/requiredEvidence/contextPolicy/artifactTypes/ownershipScope/decisionAuthority/riskPolicy) — versioned, `TOOL_RISK` 24/24, `tierBudget` $8/$6/$4.

**Roster:** 24 contracts, 8 skills, `reachability 24/24` — see table in `docs/AGENT-DESIGN-REPORT.md` v1.0 (per-branch fan-out now included: `enterprise-feature` 23/24 + hotfix 1).

Per-agent: role/tier/$/iters/allowed/forbidden/skills/verification/capability/workflow stage — e.g., `principal` PRINCIPAL REASONING $8 10it `approval`, `captain` ORCHESTRATOR $8 40it `planning`, `product-manager` PRODUCT $6 `discovery`, `adversarial-reviewer` REVIEW $8 `review/adversarial` (now fanOut V2).

All `policy-laws.ts` 20 non-negotiable laws enforced outside LLM.
