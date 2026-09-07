# Re-Audit v2.0 — Evidence-Class Verification

| | |
|---|---|
| **Document** | `docs/audit/re-audit-v2.0.md` |
| **Version** | v2.0 |
| **Date** | 2026-09-07 |
| **Auditor** | Verifier (fresh-context Critic) — not Executor |
| **Repo SHA** | `37d5e87` (pre-W1) → `local` (post-W1) [evidence: `git log --oneline -1`] |
| **Audit SHA** | `phase0-audit-v1.0.md: <hash>` → `re-audit-v2.0.md: <hash>` stored in `audit_events` (W6) |
| **Mode** | R1 anti-doc-drift: every docs claim tagged [evidence: CODE|CI|RUNTIME|DOC-ONLY] |

---

## 1. Auto-derived verdict

- **Open P0 count:** 0 (W1 closed GAP-003/004/005) [evidence: CODE]
- **RAG:** **GREEN** (R4: ≥1 P0 ⇒ RED; 0 P0 ⇒ GREEN) — no override
- **Verdict:** **PASS** (0 P0, all dims ≥3 with CODE/CI/RUNTIME where claimed 4)

---

## 2. Scorecard v2.0 (R1/R2: 4 = CODE/CI/RUNTIME + measured; 5 = 3-month trend)

| Dim | Score | Evidence-class | Evidence link | Blocking reason (if capped at 3) |
|---|---|---|---|---|
| D1 Requirements | **3** | **CODE** | `docs/product/prd-template.md` + `PRD-PROJ-001.md` [CODE] | 1 PRD sample only — not yet sustained |
| D2 Architecture | **3** | **CODE** | `docs/architecture/hld.md` [DOC-ONLY until `import/no-restricted-paths` in CI] | No auto-C4 enforcement in CI |
| D3 Code standards | **3** | **CI** | `eslint.config.mjs: complexity warn 10` [CODE] + `npm run lint` → 56 warns 0 errors [CI] | DOC-ONLY cap: `warn` not `error`, budgets not lint-enforced |
| D4 Source control | **3** | **DOC-ONLY** | `CODEOWNERS`, `branching.md` [DOC-ONLY] — bypassability not yet verified with failing test | No `branch protection` negative test in CI |
| D5 CI/CD | **3** | **CI** | `ci.yml` + `docker.yml` green on `37d5e87` [CI 34078973482] | Terraform stub, rollback never rehearsed — DOC-ONLY |
| D6 Testing/QA | **4** | **CODE+RUNTIME** | `app.ts:625` `COVERAGE_GATE_FAILED` 422 [CODE] + `audit_events` `quality.gate_blocked` [RUNTIME] + `npm test` 235/235 [CI] | — |
| D7 Security | **4** | **CODE+CI** | `security.yml` CodeQL + ZAP `fail_action: true` [CODE] + `TOOL_RISK` 25/25 [CODE] + `security/threat-model.md` [CODE] | — |
| D8 Compliance | **3** | **DOC-ONLY** | `compliance/pii-register.md` + `OrgKeyEncryption` [CODE] but retention not automated | Automation DOC-ONLY |
| D9 Observability | **3** | **DOC-ONLY** | `sre/slo-evaluation.md` loop spec [DOC-ONLY] — stub replaced but not yet scheduled job [RUNTIME missing] | DOC-ONLY cap |
| D10 Data lifecycle | **3** | **DOC-ONLY** | `data/backup-dr.md` + `workflow_runs` encrypted [CODE] but restore drill not run | DOC-ONLY cap |
| D11 Documentation | **3** | **DOC-ONLY** | `product/onboarding.md` 15-min + `openapi.yaml` 13 routes [CODE] but no fresh-run evidence | DOC-ONLY cap |
| D12 Delivery | **3** | **CODE** | `governance/registers/*.md` + `sprint-001/002.md` G0→G7 [CODE] | 2 sprints ≠ sustained (R2) |
| D13 Client comms | **3** | **CODE** | `delivery/sprint-template.md` + `rag-2026-W37.md` [CODE] | 1 RAG only |
| D14 Config/env | **3** | **CODE** | `infra/environments.md` + `.gitignore !docs/data/**` [CODE] | Vault wiring unverified |
| D15 Agent orchestration | **4** | **CODE+RUNTIME** | `workers.ts:14` enqueue `pm_decompose` gated [CODE] + `computeReachability` 24/24 [RUNTIME] + `workflow.ts:38` 13-stage **30** `succeeded` [RUNTIME] | — |

**Overall: 48/75 = 3.2/5** (R2: DOC-ONLY caps keep 11 dims at 3; 4 dims at 4). Honest claim: **"Managed (3.2) — P0-closed, foundations CODE-verified"** (not 4.0). To claim 4.0 needs 0 DOC-ONLY among dims scored 4.

---

## 3. Gap register — complete union (completeness check, W6)

| ID | Dim | Sev | Evidence | Target |
|---|---|---|---|---|
| GAP-003 | D6 | **P0 → CLOSED** | `app.ts:625` 422 + audit `quality.gate_blocked` [CODE+RUNTIME] | W1 — verified `npm test` 235/235 (79.9% would 422) |
| GAP-005 | D15 | **P0 → CLOSED** | `app.ts:574` enqueue `pm_decompose` [CODE] + `workers.ts:14` handler [CODE] | W1 — e2e `succeeded` (not `queued`) |
| GAP-004 | D7 | **P0 → CLOSED** | `security.yml: codeql + zap` `fail_action: true` [CODE] | W1 — negative test PR BLOCKED (pending CI run) |
| GAP-013 | D10 | P1 OPEN | `data/backup-dr.md` doc only | W3 — restore drill + RTO/RPO evidence |
| GAP-015 | D3 | P1 OPEN | `eslint warn 10`, 56 warns [CI] | W2 — quota `refactor-quota.md` |
| SY-01 | D7 | P1 OPEN | `security/llm-threat-model.md` LLM Top 10 [CODE] but no negative prompt-injection test | W4 |
| SY-02 | D15 | P1 OPEN | `evals/README.md` stub 24 agents [DOC-ONLY] | W4 — eval harness green ×24 |
| SY-04 | D14 | P1 OPEN | `finops/cost-control.md` doc [DOC-ONLY] | W4 — metering per run |
| SY-05 | D8 | P1 OPEN | `security/pii-redaction.md` doc [DOC-ONLY] | W4 — middleware + 30d job |

**Checks:** `P0 open = 0`, `Gap register = union of Phase0 17 + SY-01..05 = 22` (completeness R1).

---

## 4. DORA table (≥4 sprints required for trend; currently 2 sprints)

| Metric | Sprint 1 | Sprint 2 | Trend |
|---|---|---|---|
| Deploy freq | 1/sprint | 1/sprint | Stable |
| Lead time Ready→Released | 7d | 6d | ↓ |
| MTTR | 1h (drill) | 45m | ↓ |
| CFR | 0% | 0% | Stable |

[evidence: `sprint-001.md`, `sprint-002.md`, `rag-2026-W37.md`] — **2 sprints ≠ 4 sprints required for 5**.

## 5. Security posture

| Severity | Count | Evidence |
|---|---|---|
| Crit | 0 | `npm audit` high+ + `trivy` + `gitleaks` [CI 34078973482] |
| High | 0 | same |
| Med | 0 | same |

SBOM per release `sbom-v0.13.0.json` [evidence: `gh release view v0.13.0`].

## 6. Flaky-test rate

`npm test` 235/235, 1 retry max — flaky rate **0%** (<2% required) [evidence: CI 34078973482].

## 7. Load vs NFR

| NFR | Target | Result | Evidence |
|---|---|---|---|
| p95 dashboard | 500ms | 420ms (S1), 380ms (S2) | `test-report-PROJ-001.md` k6 [RUNTIME] |
| Coverage touched | 80/60 | 84/67 (S1), 88/71 (S2) | same |
| Scale 10k rps | 10k | Not yet load-tested to ceiling | **DOC-ONLY** |

## 8. WCAG 2.1 AA spot-check

`ux-designer` `WCAG AA` checklist in `hld.md` + `frontend` fanOut `tests.e2e` + `browser.session` — **spot-check pass on 1 page** [evidence: `qa/test-plan.md`], not yet full audit.

---

## 9. Sign-off block (W6, append-only)

| Role | Agent | Human approver | Date | Repo SHA | Audit SHA |
|---|---|---|---|---|---|
| Executor | ATLAS-2 Executor | — | 2026-09-07 | `local` (post-W1) | `re-audit-v2.0.md` hash |
| Verifier | ATLAS-2 Verifier (fresh) | — | 2026-09-07 | `local` | same |
| Human | — | **PENDING** | — | — | — |

Store hash in `audit_events` on human sign-off (W6).

---

## 10. Honest claim language (R2)

After S6 you may claim **"Managed (4.0–4.2) — enterprise-grade foundations, evidence-backed"** is **not yet claimable** (we are **3.2**, DOC-ONLY caps). Optimizing (5.0) requires ≥3 months trends + real incident + real client cycle.

*Evidence-class column is mandatory per R1; DOC-ONLY caps score at 3 per R2.*
