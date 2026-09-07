# Roadmap v1.0 — Phased Upgrade to Enterprise Grade

| | |
|---|---|
| **Document** | `docs/governance/roadmap-v1.0.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Basis** | `docs/audit/phase0-audit-v1.0.md` — 17 gaps (7×P0), maturity 2.3/5 |
| **Assumptions** | AS-02 solo ~10h/week, AS-03 no SOC 2 deadline, AS-01 self-host Docker |
| **Effort unit** | Person-days @10h/week ≈ 2 days/week; calendar weeks shown |
| **Gate model** | §7 G0–G7; G0/G1/G5 human; no code before G2 (Hard Rule 1) |

---

## 1. Gap → phase map (traceability)

| Gap | Phase | Why there |
|---|---|---|
| GAP-001 (PRD/taxonomy), GAP-006 (RACI/registers/SDLC) | **Phase 1** | Governance foundation — without RACI no ownership |
| GAP-002/012 (HLD/LLD, ADR-0001, C4) | **Phase 2** | Design pack at G1 |
| GAP-015 (complexity/diff budgets) | **Phase 3** | Engineering standards |
| GAP-014 (IaC, blue-green), part of D5/D10 | **Phase 4** | CI/CD & env |
| GAP-003 (80/60 gate) | **Phase 5** | Quality gates in CI |
| GAP-004/007 (SAST/DAST, TOOL_RISK), GAP-017 (PII) | **Phase 6** | Security & compliance |
| GAP-009 (SLO evaluation, incident SOP) | **Phase 7** | Observability/SRE |
| GAP-013 (backup/restore, RTO/RPO) | **Phase 8** | Data lifecycle |
| GAP-010 (15-min onboarding, OpenAPI docs, runbooks) | **Phase 9** | Documentation |
| GAP-011 (RAG, demo, escalation) | **Phase 10** | Delivery ops |
| GAP-008/016 (agent orchestration) | **Phase 1** (workflow/RACI) — **local 8-file redesign already ready**, merges at G1 |

---

## 2. Roadmap table (§9.3)

| Phase | Objective | Key tasks (workstreams) | Artifacts (§5) | Est. effort | Exit gate | Dependencies |
|---|---|---|---|---|---|---|
| **1** | **Governance & Delivery Foundation** | RACI matrix for every artifact type (12 roles); SDLC SOP v1.0 with §7 gates + approvers; ticket taxonomy `PROJ-###` + states Backlog→Ready→In Progress→In Review→In QA→Staging→Released→Done; estimation standard (reference-task); registers: risk, tech-debt, decision, change-request | `docs/governance/sdlc-v1.0.md`, `raci.md`, `registers/{risk,tech-debt,decision,change-request}.md`, `docs/product/prd-template.md` | **6 days / 3 wks** | **G0→G1 human approves RACI+SDLC** | Phase 0 audit |
| **2** | **Architecture & Design Standards** | C4 HLD + per-module LLD; ADR process (MADR) + `ADR-0001` (current arch); API-first `openapi.yaml` (OAS 3.1) + standard error envelope + pagination/idempotency; NFR register (p95, avail %, RTO/RPO, scale) | `docs/architecture/{hld.md,lld-*.md}`, `docs/adr/ADR-0001.md`, `openapi.yaml`, `docs/architecture/nfr-register.md` | **8 days / 4 wks** | **G1 human+Critic approve design pack** | Phase 1 (RACI) |
| **3** | **Engineering Standards & Source Control** | Linter+formatter pre-commit hooks; `max-complexity 10`, function/file size budgets; trunk-based branching doc, squash merge; `CODEOWNERS`, PR template, diff ≤400 lines gate | `docs/engineering/style-guide.md`, `.pre-commit-config`, `CODEOWNERS`, `.github/pull_request_template.md` | **4 days / 2 wks** | CI blocks non-conforming PRs; zero direct push to main | Phase 2 |
| **4** | **CI/CD & Env Mgmt** | Pipeline `lint→typecheck→unit→build→integration→e2e→security→publish` immutable artifact; envs local/dev/staging/prod (compose prod parity); 12-factor + vault (no secrets in repo/logs); non-root multi-stage Docker; Terraform for staging; blue-green rehearsal + auto rollback on SLO breach; expand-contract migrations | `.github/workflows/*`, `infra/terraform/*`, `Dockerfile`, `docs/runbooks/rollback.md` | **8 days / 4 wks** | One-click green + rollback rehearsed | Phase 3 |
| **5** | **Quality Engineering** | Coverage gate on core (≥70% unit, 80/60 on touched via `POST /tasks/:id/receipt` enforcement); contract tests for APIs; e2e for top-5 journeys; test plan→cases traceable to AC→report→defect lifecycle; k6 load baseline vs NFR; WCAG 2.1 AA checks | `docs/qa/test-plan.md`, contract tests, `k6/` baseline, CI gate | **6 days / 3 wks** | Gates enforced; test report per release | Phase 4 |
| **6** | **Security & Compliance** | CI SAST (CodeQL), deps (Trivy/Snyk), secrets (gitleaks), DAST on staging; STRIDE for core flows; ASVS L2 checklist; RBAC matrix; OAuth2/OIDC; input validation/encoding; encryption at rest/in transit; PII classification+retention; audit log; patch SLA crit 24h/high 72h | `docs/security/{threat-model,rbac,checklist}.md`, CI scans, `docs/compliance/pii-register.md` | **8 days / 4 wks** | Zero crit/high at gate | Phase 5 |
| **7** | **Observability & Incident** | OTEL tracing; JSON logs + correlation IDs; RED/USE metrics + dashboards; SLOs+error budgets + runbooks; incident SOP (severity matrix, comms template, blameless postmortem ≤48h); DORA baseline | `docs/sre/{slo,runbooks,incident-sop}.md`, dashboards, `postmortems/` | **6 days / 3 wks** | Simulated incident e2e + postmortem | Phase 6 |
| **8** | **Data Governance** | Reversible versioned migrations (expand-contract); no manual prod edits; backup schedule+retention+monthly restore drill; DR plan with tested RTO/RPO; masked fixtures for lower envs | `docs/data/{migration-playbook,backup-dr}.md`, drill report | **4 days / 2 wks** | Restore drill documented | Phase 4 |
| **9** | **Documentation** | README 15-min setup test, ARCHITECTURE, RUNBOOKS, ONBOARDING, CHANGELOG; API docs auto-generated from OpenAPI; docs-in-same-PR as code (DoD), doc ownership in RACI | `README.md` (15-min), `docs/runbooks/*`, generated `docs/api/*` | **4 days / 2 wks** | Fresh human/agent setup+deploy via docs only | Phase 2 + Phase 6 |
| **10** | **Delivery Ops** | 2-week sprints: planning, async standup log, review/demo, retro→tickets; weekly RAG report; release notes; escalation matrix + SLA | `docs/delivery/{sprint-*.md,rag-*.md}`, `CHANGELOG.md` | **4 days / 2 wks (×2 sprints to close)** | **Two clean sprint cycles with all artifacts** | Phase 1 |

**Critical path:** 1→2→3→4→5→6→7→8→9→10 = **58 days (~29 wks @10h/wk)**. D12/D13 unblock early via Phase 1; D15 local redesign merges at G1 (no extra calendar).

---

## 3. Sprint 0 plan — Phase 1 only (concrete, day-by-day)

**Goal:** Deliver Phase 1 exit artifacts and pass G0→G1. No implementation code (Hard Rule 1).

| Day | Owner | Tasks | Output |
|---|---|---|---|
| **1** | Orchestrator + Principal | Kickoff; confirm AS-02/03/04; lock RACI roles for 12 artifact types (§6) | `raci.md` draft v0.1 |
| **2** | Orchestrator + PM | Draft SDLC SOP v1.0 (§7 gates G0–G7 + entry/exit + approvers); ticket taxonomy `PROJ-###` + states | `sdlc-v1.0.md` draft |
| **3** | Tech Lead + QA | Estimation standard: reference-task calibration (S/M/L + T-shirt → points); define Ready gate checklist | `estimation.md` (addendum to SDLC) |
| **4** | Orchestrator + All | Create 4 registers with owners + SLAs: `risk.md`, `tech-debt.md`, `decision.md`, `change-request.md` (seed GAP-001..017 as initial entries) | `registers/*.md` v1.0 |
| **5** | PM + Architect | PRD template with user story + `Given/When/Then` AC + NFR trace; change-request SOP | `docs/product/prd-template.md` |
| **6** | Orchestrator + Critic | Review pass: self-audit vs D1/D12/D15; fix gaps; version all docs v1.0 + changelog | All Phase 1 artifacts v1.0 |

**Effort:** 6 days (fits 3 wks @10h/wk). **Exit check:** human approves `raci.md` + `sdlc-v1.0.md`; ticket `PROJ-001` (create Phase 2 design pack) can then be marked Ready.

---

## 4. Risks & mitigations (delivery lens)

- **Solo 10h/wk → long calendar:** mitigate by keeping agent redesign uncommitted but ready (saves 2 wks), and by strict WIP=1 per phase.
- **No SOC 2 deadline assumed:** if SOC 2 declared, Phase 6 moves earlier (swap with Phase 5) — flag at ACK.
- **Context loss across sprints:** mitigated by P5 Single Source of Truth — every decision → ADR/register, never chat memory.

---

## 5. What needs human ACK now

1. Confirm roadmap priorities/phasing and effort at 10h/week, or propose alternate hours.
2. Approve assumptions AS-02/03/04 or correct them (especially team & compliance).
3. Authorize **Sprint 0 execution** (Phase 1, 6 days, no code).

No code will be written until G1 passes.

---

*Roadmap is the contract. Every phase is file-produced, gate-checked, and traceable to the gap register.*
