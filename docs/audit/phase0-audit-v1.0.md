# Phase 0 — Critic Audit Report v1.0

| | |
|---|---|
| **Document** | `docs/audit/phase0-audit-v1.0.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Auditor** | ATLAS — Principal Enterprise Consultant |
| **Baseline** | Live app v0.12.0 (`3aef4c0`), 24 agents, 8 skills, 4 workflows; local redesign (uncommitted) noted where relevant |
| **Standards** | ISO 27001 / SOC 2, OWASP Top 10 + ASVS L2, 12-Factor, DORA, CMMI, WCAG 2.1 AA, Conventional Commits, SemVer, ADR (MADR), OpenAPI 3.1, ITIL-lite |
| **Confidence** | High (source-verified), Medium where human input missing (AS-## flagged) |
| **Gate** | G0 (Discovery) — human ACK required before roadmap |

---

## 1. Context intake — status

| # | Intake item (§2) | Received? | Source / assumption |
|---|---|---|---|
| 1 | Current-state report (Agency-OS workflow/SOP doc) | **Yes** | `docs/AGENT-AUDIT-REPORT-v0.12.0.md` pasted in previous turn + live verification 48/48 |
| 2 | App tech stack + repo structure | **Partial** | Inferred from repo: Node 24, TypeScript, Fastify, SQLite/Postgres, Docker, Vite/React dashboard; hosting env **assumed AS-01** |
| 3 | Current agent roster (names, roles, prompts) | **Yes** | `packages/orchestration/src/agents.ts` — 24 contracts, 12-field `AgentDefinition` |
| 4 | Team profile: solo founder vs team, human hours/week | **Missing** | **AS-02**: assumed solo founder, ~10 human hrs/week, high agency on agents |
| 5 | Constraints: deadline, budget, compliance, hosting | **Missing** | **AS-03**: no hard deadline, no SOC 2/GDPR mandate declared, self-hostable; **AS-04**: staging = prod parity via Docker, no external audit yet |

> **No silent fabrication.** Scores below tag confidence Low/Med/High per dimension where AS-* applies.

---

## 2. Executive verdict (3 lines)

**Maturity 2.3/5 (Managed bar = 3) — BLOCKED for enterprise claim.** Engineering foundations (lint/typecheck/build, CI, reversible migrations, agent contracts) are Defined; quality gates, security enforcement, delivery governance, and agent orchestration are Repeatable at best and in 4 cases Ad-hoc. The local agent redesign (13-stage fan-out, 100% roster, TOOL_RISK closed) lifts D15 to 4, but 10 P0 gaps remain across D1/D6/D7/D12/D13.

**Strongest:** D3 Code standards (4), D4 Source control (3), D5 CI/CD (3), D14 Config hygiene (3). **Weakest:** D12 Delivery management (1), D13 Client comms (1), D6/D7/D9 (2).

**Unblock path:** Close P0 gaps in Phases 1–2 (RACI + SDLC SOP + coverage/ADRs/OpenAPI), then re-gate at G1. Two clean sprints (§7 G6–G7) required for Done.

---

## 3. Maturity scorecard — D1–D15 (0 Absent → 5 Optimizing), bar = 3

| # | Dimension | Score | Level | Confidence | Evidence (file:line) |
|---|---|---|---|---|---|
| D1 | Requirements & scope | **2** | Repeatable | Med (AS-02) | `workflows/skills/srs-authoring.yaml`, `acceptance-criteria.yaml`, `app.ts:574` DoR warnings unconditional; no versioned PRD template, no `PROJ-###` ticket taxonomy, no change-request log (`docs/audit` missing) |
| D2 | Architecture & design | **2** | Repeatable | High | `workflows/skills/adr-writing.yaml` modify-mode only, `delivery.ts:183` ADR draft gated by `FEATURE_AGENT_SPECIALISTS=off`; no HLD/LLD pack, no OpenAPI contract, C4 not enforced; `ADR-0001` missing |
| D3 | Code standards | **4** | Managed | High | `eslint` + `tsc -b` enforced in CI (`.github/workflows/ci.yml`), strict types, dashboard build; complexity budget not budgeted (no `max-complexity` gate) — hence 4 not 5 |
| D4 | Source control | **3** | Defined | High | Protected `main` (bypass logged at push `86f2272..3aef4c0`), Conventional Commits, SemVer, single trunk model; `CODEOWNERS`/`PULL_REQUEST_TEMPLATE` missing, PR diff budget not enforced |
| D5 | CI/CD | **3** | Defined | High | Pipeline `lint→typecheck→unit→build→e2e→security scan→publish` (ci.yml + docker.yml + release.yml), multi-env via `12-factor`, non-root Docker, rollback (`app.ts:2070`); IaC not versioned (no Terraform), deploy is `deploy:staging` approval only, no blue-green/canary rehearsal |
| D6 | Testing & QA | **2** | Repeatable | High | 235/235 tests, Playwright e2e, but `POST /tasks/:id/receipt` stores `coverageLine/Branch` without 80/60 enforcement (`app.ts:625`); QA is `qa-engineer` declarative, no defect lifecycle register |
| D7 | Security | **2** | Repeatable | High | `security-scan` tool + Trivy/Trivy scan (docker.yml), `threat-model-stride` skill, RBAC, audit chain; SAST/CodeQL not in CI, DAST missing, secrets via `settings:write` but no vault (e.g., HashiCorp), `TOOL_RISK` had 6 gaps (now locally fixed) |
| D8 | Compliance & data governance | **2** | Repeatable | High | PII redaction (`packages/scraper`), `OrgKeyEncryption` codec for `workflow_runs.state_json`, audit logs; no PII classification register, no retention policy doc, no RTO/RPO declared |
| D9 | Observability & SRE | **2** | Repeatable | High | OTEL tracing (`tracing.ts`), `agencyos_build_info` + `http_requests_total` metrics, structured logs with correlation IDs; SLO stubs written (`srePostDeployCheck`) but no evaluation loop, no incident SOP/postmortem |
| D10 | Data lifecycle | **3** | Defined | High | Versioned reversible migrations (`0010` applied live), `data/agencyos.sqlite` + Postgres smoke; no backup/restore drill doc, no expand-contract runbook, no RTO/RPO |
| D11 | Documentation | **2** | Repeatable | Med | `README.md`, `SKILLS.md`, 4 workflow docs; `diataxis-map` skill, `docs/AGENT-AUDIT-REPORT-v0.12.0.md` exists; no 15-min onboarding test, no auto-generated OpenAPI docs, no `ARCHITECTURE.md`/`RUNBOOKS` versioned |
| D12 | Delivery management | **1** | Ad-hoc | Low (AS-02) | No sprint cadence, no estimation standard, no `risk/tech-debt/decision/change-request` registers, no RACI (Phase 1 artifact `raci.md` missing) |
| D13 | Client comms | **1** | Ad-hoc | Low (AS-02) | No weekly RAG report, no demo protocol, no escalation matrix/SLA (solo founder assumed) |
| D14 | Config & env hygiene | **3** | Defined | High | 12-factor via `config.ts`, feature flags (`FEATURE_AGENT_SPECIALISTS`, `FEATURE_A2A` etc.), `business.local.json` gitignored, zero secrets in repo (gitleaks in ci); flag defaults undocumented |
| D15 | Agent orchestration | **2** (local redesign → **4**) | Repeatable → Managed | High | Live: 10-stage sequential `enterprise-feature`, 9/24 agents, `pm_decompose` orphaned (`workers.ts:14` no enqueue), single-axis review, `adversarial-reviewer` in no workflow. **Local redesign (uncommitted, 8 files):** 13 stages + 6 fan-outs (17 branches), 23/24 in default + 1 hotfix-only = 24/24, dual review, shift-left threat model, `TOOL_RISK` 25/25 — gate-ready |

**Overall: 34/75 = 2.27 (live) / 36/75 = 2.40 (with local agent redesign). Bar = 3.0 — not met.**

---

## 4. Gap register (P0 blocks enterprise claim)

| Gap ID | Dim | Sev | Evidence | Risk if unaddressed | Target phase | Owner |
|---|---|---|---|---|---|---|
| GAP-001 | D1 | **P0** | No `PROJ-###` taxonomy, no `docs/product/prd-template.md`, no change-request log | Scope creep, untraceable requirements | Phase 1 | PM/Orchestrator |
| GAP-002 | D2 | **P0** | No `docs/architecture/{hld,lld}.md`, no `ADR-0001`, no `openapi.yaml` contract | Architecture drift, integration rework | Phase 2 | Architect |
| GAP-003 | D6 | **P0** | `app.ts:625` receipt without 80/60 check; `coverage-gate-80-60` skill declarative only | False-green releases, defect escape to prod | Phase 5 (enforce) + Phase 1 (SOP) | QA |
| GAP-004 | D7 | **P0** | SAST (CodeQL) + DAST absent from CI; secrets not in vault | OWASP ASVS L2 fail, credential leak | Phase 6 | Security Eng |
| GAP-005 | D15 | **P0** | `pm_decompose` registered `workers.ts:14` but never enqueued; no app-layer trigger | Product decomposition never happens | Phase 1 (SDLC) + app fix post-gate | Orchestrator |
| GAP-006 | D12 | **P0** | No `raci.md`, no `registers/{risk,tech-debt,decision,change-request}.md`, no SDLC SOP v1.0 | No accountability, delivery ad-hoc | Phase 1 | Orchestrator/Principal |
| GAP-007 | D7 | P1 | `TOOL_RISK` 6/25 missing (now fixed locally, uncommitted) | Permission bypass | Phase 6 (hardening) | Security Eng |
| GAP-008 | D15 | P1 | `adversarial-reviewer` in no workflow (live); single-axis review | Spec drift, attack cases untested | Phase 1 (workflow) — **fixed locally** | Architect |
| GAP-009 | D9 | P1 | SLO stubs without evaluation; no incident SOP/postmortem | Silent SLO breach, no learning | Phase 7 | SRE |
| GAP-010 | D11 | P1 | No 15-min onboarding test; no auto OpenAPI docs; no `docs/runbooks/*` | Onboarding >15 min, tribal knowledge | Phase 9 | Tech Writer |
| GAP-011 | D13 | P1 | No weekly RAG report, demo protocol, escalation matrix | Client trust, no early warning | Phase 10 | Orchestrator |
| GAP-012 | D2 | P1 | C4 diagrams not generated/checked; ADRs not required at `architecture` gate | Design not reviewable | Phase 2 | Architect |
| GAP-013 | D10 | P1 | No backup/restore drill doc, no RTO/RPO, no expand-contract playbook | Data loss, untested recovery | Phase 8 | DBA/SRE |
| GAP-014 | D5 | P1 | No IaC (Terraform), no blue-green/canary rehearsed, `deploy:staging` only | Non-reproducible envs, risky prod cut | Phase 4 | DevOps |
| GAP-015 | D3 | P2 | No complexity budget (`≤10`) gate, no diff-size budget (400 lines) | Code rot, large PRs | Phase 3 | Tech Lead |
| GAP-016 | D15 | P2 | `finops-agent` breach escalation prose-only; `FEATURE_AGENT_SPECIALISTS=off` | Cost overruns late | Phase 1 (RACI) + Phase 7 | FinOps |
| GAP-017 | D8 | P2 | No PII register, retention policy, or audit-log retention rule doc | GDPR/SOC 2 gap | Phase 6/8 | Security/DBA |

---

## 5. Assumptions & confidence

- **AS-01** (hosting): staging = prod parity via Docker Compose; prod = self-hosted Docker. Confidence **Med** — inferred from `docker.yml` + `data/agencyos.sqlite`.
- **AS-02** (team): solo founder, ~10 hrs/week human availability; agency execution delegated to agents. Confidence **Low** — intake missing.
- **AS-03** (compliance): no SOC 2/GDPR mandate declared; 12-Factor + audit logs sufficient for now. Confidence **Low**.
- **AS-04** (delivery): sprint cadence not yet established; using 2-week sprints starting Phase 1. Confidence **Low**.

All Low-confidence sections are tagged and will be corrected at human ACK.

---

## 6. What is *already* enterprise-grade

- Strict typing + lint/typecheck/build enforced in CI (D3=4).
- 235/235 tests, Playwright e2e, docs-check invariants (D6 harness, though gate not enforced).
- Trunk-based, Conventional Commits, SemVer, protected main (D4=3).
- Reversible migrations, Postgres smoke, expand-contract groundwork (D10=3).
- 24-agent roster with 12-field contracts, capability routing (scored, audited), handoff contracts with `escalate/review/standard` policy, evidence registry with hash verification (D15 foundation — now locally Managed).

---

## 7. Recommendation

**BLOCK at G0.** Deliver Phase 1 on **intake ACK**: `raci.md` + `sdlc-v1.0.md` + ticket taxonomy (`PROJ-###`) + four registers + `prd-template.md`. Effort ~1 sprint at assumed 10 hrs/week. Re-gate at G1 with design pack (HLD/LLD, ADR-0001, OpenAPI 3.1) before any code beyond agent-only (per P1/P2 constraints already respected — local agent redesign stays uncommitted until G0 ACK).

---

## 8. Artifacts produced this phase

- `docs/audit/phase0-audit-v1.0.md` (this file) — versioned audit per P1
- `docs/AGENT-AUDIT-REPORT-v0.12.0.md` (prior) — current-state evidence
- `docs/AGENT-ENTERPRISE-REDESIGN-REPORT.md` — local 8-file redesign pre-proposal (uncommitted, for G1 discussion)

## 9. Change log

- v1.0 — initial Phase 0 audit

---

*Evidence-first. No flattery. Every finding above cites a file:line or a missing file.*
