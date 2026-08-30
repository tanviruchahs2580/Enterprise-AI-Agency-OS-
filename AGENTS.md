# AGENTS

The roster seeds automatically (`POST /api/v1/agents/seed` or at boot).
Each agent is a **contract**, not a persona: allowed/forbidden tools, model tier,
iteration cap, timeout and budget.

| Agent | Role | Tier | Budget cap | Skills | Notes |
|---|---|---|---|---|---|
| principal | PRINCIPAL | REASONING | $8 | — | vision, approvals, escalations |
| captain | ORCHESTRATOR | REASONING | $8 | — | decomposition & dispatch, 40 iters |
| product-manager | PRODUCT | STANDARD | $6 | srs-authoring, acceptance-criteria | PRD, stories, acceptance criteria (wired: pm_decompose) |
| requirements-engineer | PRODUCT | STANDARD | $6 | srs-authoring, acceptance-criteria | SRS, edge cases, Definition of Ready (wired: DoR warnings on task create) |
| architect | ARCHITECTURE | REASONING | $8 | adr-writing, threat-model-stride | C4, ADRs, threat models (wired: modify-mode ADR drafts) |
| staff-engineer | ENGINEERING | REASONING | $8 | tdd-red-green-refactor | deep modules, cross-cutting refactors |
| frontend-engineer | ENGINEERING | STANDARD | $6 | tdd-red-green-refactor | accessible UIs + e2e checks |
| backend-engineer | ENGINEERING | STANDARD | $6 | tdd-red-green-refactor | APIs/services with TDD |
| localization-engineer | ENGINEERING | STANDARD | $6 | — | i18n, locale bundles, RTL/LTR, pluralization |
| ux-designer | PRODUCT | STANDARD | $6 | — | interaction/visual design, a11y, flow states |
| data-analytics-engineer | DATA | STANDARD | $6 | — | reporting models, metrics definitions, dashboards |
| database-engineer | DATA | STANDARD | $6 | — | reversible migrations only |
| devops-engineer | PLATFORM | STANDARD | $6 | — | CI/CD, IaC; staging deploys |
| sre | PLATFORM | STANDARD | $6 | — | SLOs, runbooks, error budgets (wired: post-deploy SLO stubs) |
| qa-engineer | QUALITY | STANDARD | $6 | coverage-gate-80-60, acceptance-criteria | coverage ≥80/60 gate ownership |
| security-engineer | SECURITY | SECURITY | $8 | threat-model-stride | threat modeling, finding triage |
| performance-engineer | QUALITY | STANDARD | $6 | — | benchmarks before/after |
| release-manager | RELEASE | STANDARD | $6 | — | SemVer, changelogs, rollback plans |
| documentation-engineer | DOCS | FAST | $4 | diataxis-map | Diataxis coverage map |
| code-reviewer | REVIEW | REVIEW | $8 | — | standards axis; cannot commit |
| adversarial-reviewer | REVIEW | REASONING | $8 | — | spec-fidelity axis; tries to break changes |
| research-agent | RESEARCH | FAST | $4 | cited-research | cited claims: source/date/confidence |
| support-agent | SUPPORT | FAST | $4 | — | reproduction-first triage |
| finops-agent | FINANCE | FAST | $4 | — | budget breaches escalated same day |

Budget cap is risk-weighted by tier (audit Phase 2.4): REASONING/SECURITY/REVIEW
= $8, STANDARD = $6, FAST/VISION/LOCAL = $4. Skills resolve from
`workflows/skills/*.yaml` via the skill loader (`GET /api/v1/skills`).

## Tool risk matrix (excerpt)

| Tool | Risk | Destructive | Network |
|---|---|---|---|
| deploy.production | critical | yes | yes |
| secrets.rotate / secrets.read | critical | rotate=yes | no |
| shell.write, db.migrate, browser.session, deploy.staging | high | yes/no | varies |
| github.pr, tests.e2e, web.fetch, fs.workspace, db.query | medium/low | no | varies |

Destructive or high-risk tool use routes through the approval service — the
enforcement lives in the permission layer, not in prompts.

## Handoff contract

Every execution persists a `handoff` knowledge document:
what was requested → what was produced → what remains → tests run → risks →
next recommended action. Facts vs assumptions are distinguished by the
`knowledge_documents.kind` field (`fact`/`assumption`/`hypothesis`/…).
