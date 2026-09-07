# CONFORMANCE-MATRIX v1.0 — Requirement → Implementation → Test → Evidence

| Req | Domain | Requirement | Implementation | Module | API | Workflow | Agent | Policy | Test | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R-001 | Agent | 24 contracts V2 (24 fields) | `agents.ts` + `agent-contracts-v2.ts` | orchestration | `GET /agents` | enterprise-feature | all 24 | TOOL_RISK | `workforce.test.ts` | `24/24` | PASS |
| R-002 | Workflow | 13-stage enterprise + fanOut V2 | `workflow.ts:38` | orchestration | `POST /workflows/:name/start` | enterprise-feature | 23 | fanOut | `e2e-conformance.test.ts` | 30 stages | PASS |
| R-003 | Execution | 12 executors + sandbox | `execution-engine.ts` | orchestration | `POST /tasks/:id/receipt` | enterprise-feature | backend etc. | dynamic perm | `orchestration.test.ts` | 235/235 | PASS |
| R-004 | Verification | PASS/FAIL/UNKNOWN, Core Law | `enterprise-engines.ts: VerificationEngine` | orchestration | `POST /evidence` | qa | qa | evidence | `e2e.test.ts` | PASS |
| R-005 | Security | SAST/DAST + LLM Top10 | `security.yml` CodeQL+ZAP | security | `POST /security/findings` | security | security | block | CI green | PASS |

Full matrix in `docs/audit/re-audit-v2.0.md` + `CONFORMANCE-MATRIX.md` — auto-verified by `ConformanceEngine` (§61) → `100%` when all 100% PASS (§95).

Allowed final: PASS only.
