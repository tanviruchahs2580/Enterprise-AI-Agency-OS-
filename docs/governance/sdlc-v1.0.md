# SDLC SOP v1.0 — Agency OS Enterprise Delivery

| | |
|---|---|
| **Document** | `docs/governance/sdlc-v1.0.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | Orchestrator (captain) + Principal |
| **Status** | Draft for G0→G1 approval |
| **Basis** | Master Prompt §7 Stage Gates, §6 Agent Roster, §8 Definition of Done |

---

## 1. Purpose

Single Source of Truth for how every ticket moves from idea to production with full traceability (requirement → ticket `PROJ-###` → branch `PROJ-###-slug` → PR → test → release → doc). No code without a ticket (P4), no merge without review + green CI, no deploy without approval at G5.

---

## 2. Ticket taxonomy & lifecycle

### 2.1 ID scheme
- **Format:** `PROJ-###` (zero-padded, e.g., `PROJ-001`). Project prefix is the repo slug (`PROJ`).
- **Branch:** `agency/PROJ-###-short-slug` (e.g., `agency/PROJ-042-stripe-refund`).
- **PR title:** `feat(scope): PROJ-### — human title` (Conventional Commits).

### 2.2 States

```
Backlog → Ready → In Progress → In Review → In QA → Staging → Released → Done
              ↘ Blocked → (back to Ready when unblocked)
                          ↘ Cancelled (terminal)
```

| State | Meaning | Entry condition | Exit condition | Owner |
|---|---|---|---|---|
| **Backlog** | Idea/triage | Created | Refined to PRD + AC + estimate | PM |
| **Ready** | Deemed buildable | DoR passes (§3), `Ready` gate signed | Pulled into sprint | Orchestrator |
| **In Progress** | Branch active, one agent owns ticket | Branch created, `In Progress` | PR opened, CI green, §8 DoD in progress | Assigned SWE agent |
| **In Review** | PR under two-axis review | PR + `review:requested` | `approved` on both axes (standards + adversarial) | Tech Lead + (adversarial-reviewer for high-risk) |
| **In QA** | QA owns verification | Merged to `main`? No — **QA is pre-merge**; PR is QA gate | Test report + sign-off | QA |
| **Staging** | Deployed to staging, smoke green | QA pass + security pass (if high-risk) | Smoke + DAST green, rollback ready | DevOps |
| **Released** | Deployed to prod, monitored | G5 human+DevOps approval | SLO stable 48h + release notes | SRE |
| **Done** | Closed | All §8 DoD checked, docs merged | — | Orchestrator |

- **Blocked:** any state may transition to Blocked (dependency, ambiguity). Blocked → Ready only after blocker ticket resolved or assumption escalated (P6).
- **Cancelled:** only Orchestrator/Principal may cancel; reason → decision log.

### 2.3 Estimation standard — reference-task calibration

- **Reference tasks** (calibrated, frozen after G1):
  - **S** (1 pt): fix typo in README — 2h, 1 file, no risk.
  - **M** (3 pts): add `POST /tasks/:id/receipt` validation + test — 1 day, 2 files, low risk.
  - **L** (5 pts): multi-currency payments slice — 5 days, 5+ files, high risk.
- **Scale:** 1, 2, 3, 5, 8 (Fibonacci). **8+ must be decomposed** (PM → stories).
- **Practice:** Planning Poker with captain; velocity tracked as `points/sprint`; estimation recorded on ticket before Ready.

---

## 3. Definition of Ready (DoR) — gate to Ready

All must be true; otherwise ticket stays in Backlog with warnings (as currently enforced by `reqReadinessCheck` in `app.ts:574`):

- [ ] Title ≥8 chars, description non-empty
- [ ] PRD story link + `Given/When/Then` AC (`acceptance-criteria` skill) — testable without interpretation
- [ ] Edge cases, dependencies, testability, size assessed (DoR warnings = 0)
- [ ] Estimate (points) assigned, ≤5 (or decomposed)
- [ ] NFR impact flagged (perf, security, i18n, data)
- [ ] `Ready` gate owner: **requirements-engineer**, verified by **product-manager**

---

## 4. Stage gates — §7 instantiated

| Gate | Stage | Entry | Exit criteria | Approver(s) | Ticket state at exit |
|---|---|---|---|---|---|
| **G0** | Discovery | Client brief | **PRD** (`docs/product/PRD-PRJ-###.md`) with stories + AC + estimate accepted | **Human** | Backlog→Ready |
| **G1** | Design | PRD (G0 pass) | **Design pack**: HLD/LLD (`docs/architecture/hld.md`, `lld-*.md`), **ADR-0001**, **openapi.yaml** (OAS 3.1), C4 diagrams, NFR register — all approved | **Human** + **Critic** | Ready |
| **G2** | Planning | Design pack | Sprint plan committed: tickets in Ready, assigned, estimated | **Human** | Ready→In Progress (when pulled) |
| **G3** | Build | Ticket In Progress | Green CI (`lint→typecheck→unit→build`), two-axis review **approved**, coverage gate pass, no self-approval | **Tech Lead** agent (staff-engineer) | In Progress→In Review→In QA |
| **G4** | QA | Merged PR | Test report (plan→cases traceable to AC→execution→defect log) + QA sign-off | **QA** agent | In QA→Staging |
| **G5** | Release | QA sign-off + security pass (if high-risk) | Deployed to prod + smoke green + rollback ready + release notes | **Human** + **DevOps** | Staging→Released |
| **G6** | Operate | Deployed | SLO stable 48h + release notes published + monitoring green | **SRE** agent | Released→Done |
| **G7** | Retrospective | Sprint end | Metrics reviewed (DORA, coverage, defect escape, cycle time); actions → tickets | **Orchestrator** | Done (retro) |

- **No code before G2** (Hard Rule 1). The `enterprise-feature` workflow enforces this: `discovery/requirements/architecture/planning/approval` must pass before `implementation`.
- **No merge without review + green CI** (P4) — protected `main` blocks direct push.
- **No release without G5 human** — `deployment` stage has `approvalRequired: deploy:staging`; prod is a second human gate.

---

## 5. Branching & PR rules (§3 Engineering Standards)

- **Model:** trunk-based, short-lived branches (`agency/PROJ-###-slug`), squash merge to `main`.
- **PR template** (`.github/pull_request_template.md`): link ticket `PROJ-###`, AC checklist, test/evidence links, risk label (`low/medium/high`), rollout/rollback plan.
- **Diff budget:** ≤ ~400 lines (flag >400 → decompose).
- **CODEOWNERS:** `docs/architecture/*` → architect; `packages/db/*` → database-engineer; `workflows/*` → captain.
- **Commits:** Conventional Commits + SemVer + `CHANGELOG.md` (Keep a Changelog).

---

## 6. Traceability (P2)

Every increment: `PRD (PROJ-###) → ticket → branch → PR → CI run → test report → `skill_executions` + `evidence_records` (hash-verified) → `knowledge_documents` (ADR/handoff) → `CHANGELOG` + release tag. `docs/governance/registers/decision.md` is the decision Single Source of Truth.

---

## 7. Escalation (P6)

Ambiguity → present ≥2 options + recommendation, never guess silently. Blocking comments (review, security, QA) must resolve before handoff. Handoff = artifact link, not chat summary. Context isolation per agent (inputs + shared artifacts only).

---

## 8. Change log

- v1.0 — initial SDLC SOP
