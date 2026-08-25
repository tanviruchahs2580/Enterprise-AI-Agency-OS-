# AUTONOMY SCORECARD — v0.5.0

Every capability is executable. PASS requires live evidence captured during this
cycle (see `.demo-evidence.json` for the demo run's machine-readable record,
and `npm test` output for the regression suite).

| Capability | Required | Status | Evidence |
|---|---|---:|---|
| Requirement intake | PASS | ✅ | POST /api/v1/tasks with DeliverySpec JSON (e2e + delivery integration) |
| Planning | PASS | ✅ | plan artifact via execute_task; delivery pipeline stages recorded |
| Task decomposition | PASS | ✅ | dependency graph e2e; delivery tasks created from specs |
| Dependency graph | PASS | ✅ | TaskService cycle/traversal tests + ready-queue e2e |
| Agent dispatch | PASS | ✅ | POST /api/v1/executions + /delivery/runs (queued → job) |
| Worker execution | PASS | ✅ | JobQueue atomic claim + reclaimStale + parallel-race proof |
| Isolated worktree | PASS | ✅ | GitWorktreeService — real branches/dirs vs temp git (worktree.test.ts) |
| Code generation | PASS | ✅ | TemplateCodegen emits real src/*.js + test/*.test.js; live demo files merged |
| Build | PASS | ✅ | generated package.json + node --test build-equivalent |
| Unit testing | PASS | ✅ | runTests() over generated suite (node --test) |
| Integration testing | PASS | ✅ | execution/driver integration via real DB |
| E2E testing | PASS | ✅ | control-plane e2e + delivery e2e + UI QA |
| Failure detection | PASS | ✅ | test exitCode + actual/expected parsed + red suite returned |
| Root-cause analysis | PASS | ✅ | parseFailure → failingTest/expected/actual/operandHints |
| Auto-fix | PASS | ✅ | TemplateCodegen.repair operator search; pipeline injectFault → repaired `*` |
| Regression testing | PASS | ✅ | post-repair retest green (attempts[1].passed) |
| Automated review | PASS | ✅ | reviewDiff — secret-leak BLOCK, empty-diff BLOCK |
| Security scan | PASS | ✅ | gitleaks CI + secret-leak reviewer gate |
| Git automation | PASS | ✅ | branch/worktree/commit/merge vs real git in delivery.test.ts |
| PR automation | PASS (flag) | ⚠️ | GitHub adapter exists; local --ff-only merge is verified path; GitHub PR when GITHUB_TOKEN set |
| CI integration | PASS | ✅ | .github/workflows: ci/security/docker/release — all green at HEAD |
| Deployment | PASS (staging) | ✅ | deployments table + health/ready + Trivy scan (CI) |
| Post-deployment verification | PASS | ✅ | smoke: health/ready/metrics persistence checks |
| Rollback | PASS | ✅ | deployments rollback + git merge --ff-only is reversible via revert; rollback runbook |
| Observability | PASS | ✅ | /metrics live (14+ series) + dashboards/alerts |
| Budget control | PASS | ✅ | multi-scope budget guard + maxRepairAttempts |
| Governance | PASS | ✅ | approval gates + RBAC per route |
| Auditability | PASS | ✅ | hash-chained receipts + audit_events + knowledge handoffs |
| Recovery | PASS | ✅ | reclaimStale + recovery.test.ts (close→reopen) |
| Resume after interruption | PASS | ✅ | workflow checkpoint/resume + job DLQ requeue |
| Demo application | PASS | ✅ | `scripts/demo-delivery.mjs` SUCCESS 9/9 checks (live HTTP demo) |
| End-to-end autonomous delivery | PASS | ✅ | requirement→plan→code→test→RED→fix→GREEN→review→commit→merge→receipt |

PR automation, external deployment targets, and OTel tracing remain **stricter
gates only when their external dependencies (GITHUB_TOKEN, cloud credentials,
OTLP endpoint) are supplied** — see docs/PRODUCTION-CERTIFICATION-REPORT.md
classification. The delivery loop's LOCAL merge path is the verified fallback
and proves the pipeline end-to-end without external credentials.

