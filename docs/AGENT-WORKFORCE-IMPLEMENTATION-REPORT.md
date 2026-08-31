# Agent Workforce — Implementation Report

> Handoff contract: what the master prompts asked for → what was produced →
> what remains → tests run → risks → next recommended action. Facts are
> evidence-backed; assumptions are flagged `assumption:`.

| | |
|---|---|
| **Release** | v0.12.0 (codename `agent-workforce`) |
| **Scope** | gap-closure pass over the master-prompts' orchestration requirements |
| **Baseline** | v0.11.0 (tag `v0.11.0`), 183 tests |
| **Suite** | **235/235** PASS (`npm test`, 2026-08-31) |
| **Gates** | lint ✓ typecheck ✓ build ✓ self-test ✓ docs-check ✓ |
| **Mode** | inspect-first, incremental, backward compatible — **no commits** this phase |

---

## 1. What was requested (master-prompt excerpts)

- §5 "the agency runs on a work graph, not a fixed pipeline"
- §6/§9 "auditable dispatch — the system explains why this agent, not its
  alternate"; "skills are enforced at runtime, not just declared"
- §13 "a generic router" + a handoff contract (what was → produced → remains →
  tests → risks), facts vs assumptions
- §28 "no completion claim without evidence"
- §15/§16 risk-weighted budget tiers; Phase 2.4 budget escalation wiring
- Reachability: every roster agent reachable through skill/workflow/capability
- No drift: version strings were validated in tree at `0.10.0` while the
  shipped release was `0.11.0` (same class of bug the auditors flagged)

## 2. What was produced

### 2.1 Skill execution runtime — `packages/skills/src/runtime.ts`
`SkillRuntime` owns the orchestration contract and delegates the act of doing to
hooks: preconditions (`evaluateConditionExpression`), required tool/permission
eligibility, procedure steps, verification (rubric evaluator `evaluateRubric`),
budget estimate/allowance, timeout and failure handling
(`parseFailureHandling`: `retry(maxAttempts,delayMs)` → escalate → fail, with
8-class failure taxonomy and termination-on-exhaustion). Deterministic, no DB,
15 unit tests.

### 2.2 Mission compiler — `packages/orchestration/src/mission.ts`
Deterministic classification (complexity simple→enterprise, risk low→high via
keyword heuristics, derived capabilities + name, verification level). Same
objective ⇒ same plan (test-asserted). API: `POST /api/v1/missions/compile`.

### 2.3 Capability directory + auditable router
`capabilities.ts` (`CAPABILITY_DIRECTORY`, 24 capabilities) +
`routing.ts` (`CapabilityRouter` — weighted coverage/tools/tier/risk scoring
with an explicit canonical-role tie-break and a human-readable
`whyAgentSelected`). Every API dispatch persists to `routing_decisions`, so the
decision is replayable and auditable.
API: `POST /api/v1/routing/decide`, `GET /api/v1/routing/decisions`.

### 2.4 Roster reachability — `coverage.ts`
Proves every roster agent is reachable through *some* path (skill in registry /
workflow stage role incl. fan-out / capability). API:
`GET /api/v1/agents/reachability` reports `reachableCount == total`.

### 2.5 Work-graph DAG engine — `workgraph.ts`
Kahn topological compile (cycle + dangling-dependency detection),
`execute()` walks the levels with parallel batches, conditional skip,
**skip-cascade** to dependents and **blocked dependents** isolation.

### 2.6 Typed handoffs + evidence registry
`handoff.ts`: `validateHandoff` (intent enum, confidence 0..1, facts/assumptions
as explicit fields), `verificationPolicyFor` (≥0.9 standard / ≥0.6 review /
escalate). `evidence.ts`: content hashing, tamper detection (`verifyRecord`),
completion-claim guard (`unbackedCompletionClaims` — "no claim without
evidence"). The guard is *wired* into skill-runtime verification: a completion
claim without matching evidence fails as `evidence_required`.
APIs: `POST/GET /api/v1/handoffs`, `POST/GET /api/v1/evidence`,
`POST /api/v1/evidence/:id/verify`.

### 2.7 Migration + budget downgrade enforcement
`0010_agent_workforce.sql` adds `routing_decisions`, `evidence_records`,
`agent_handoffs` (+indexes). `BudgetGuardImpl.evaluate()` implements the
previously schema-only `downgrade`/`approve_required` actions;
`ModelRouter.complete()` honours `downgrade` by re-selecting a cheaper tier and
recording `fallbackReason: budget_downgrade_<tier>`; `approve_required` still
blocks. Router tests cover downgrade-success, downgrade-no-cheaper-candidate
fallback, and approve_required block.

### 2.8 Version drift + docs reconcile
Single source of truth `apps/control-plane/src/version.ts`
(`AGENCY_OS_VERSION = "0.12.0"`) now feeds `/api/v1/meta`,
`agencyos_build_info` and OTel `AGENCY_OS_TRACING_VERSION`. Chart, image tags,
README status, CHANGELOG, PROGRESS and ROADMAP reconciled.
`scripts/docs-check.mjs` (`npm run docs-check` / `make docs-check`) enforces:
version consistency, AGENTS.md↔AGENT_ROSTER sync, skill-file sanity, docs/
artifact presence.

## 3. What remains (explicitly deferred, mostly external)

- Real-model validation / live dispatch with an LLM provider — needs
  `MODEL_PROVIDER_API_KEY` + `BASE_URL` (self-test already `WARN model:real`).
- Paid pentest and SOC 2 vendor attestation (external, previously noted).
- Dependabot PR merges; branch-protection API (needs token grants).
- `helm` CLI present for a live `helm template` smoke (chart reviewed statically).
- Mission *execution* engine above the compiler, and routing *re-scoring* from
  execution feedback (stats exist; feedback loop not yet closed onto routing).

## 4. Tests run (evidence)

| Suite | Run | Result |
|---|---|---|
| `npm test` (full, repo root) | 2026-08-31 | **235/235 PASS** (was 183) |
| skills runtime (new) | packages/skills | 15/15 |
| orchestration workforce (new) | packages/orchestration | 26/26 |
| models router (budget downtime, new) | packages/models | 9/9 |
| control-plane workforce e2e (new) | apps/control-plane | 8/8 |
| `npm run lint` | — | 0 errors |
| `npm run typecheck` | — | clean |
| `npm run build` | — | dashboard built, 691 modules |
| `npm run self-test` | — | system ready (model:real/OTLP optional WARNs) |
| `npm run docs-check` | — | all invariants hold |

## 5. Risks / notes

- `evaluateConditionExpression`/`evaluateRubric` use a syntactic leaf model:
  free-text rubrics reduce to tokens / boolean leaf lookup. Sufficient for the
  8 registry skills; richer rubrics (LLM-graded) are a future hook slot.
- Work-graph execution semantics are deterministic and unit-covered but not yet
  exercised through an HTTP surface — wiring a work-graph run endpoint is the
  natural next feature.
- Skill runtime's default `runStep` is a deterministic transcript harness; a
  real executor (LLM/shell) plugs in via hooks. No production tool execution
  paths were widened in this phase.
- `docs-check` is intentionally *not* in `self-test` (constants/docs check, not
  a runtime system check); it runs in CI as a dedicated step
  (`npm run docs-check` after `self-test` in `.github/workflows/ci.yml`).

## 6. Next recommended action

1. Close the loop: wire a `POST /api/v1/workgraphs/run` (compile+execute+
   persist) so the DAG engine gains first-class runtime evidence.
2. On user approval: commit this phase behind conventional commits, tag
   `v0.12.0`, cut the release, and re-sync the live app (parity of the new
   endpoints).