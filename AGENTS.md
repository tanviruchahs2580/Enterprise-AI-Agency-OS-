# AGENTS

The roster seeds automatically (`POST /api/v1/agents/seed` or at boot).
Each agent is a **contract**, not a persona: allowed/forbidden tools, model tier,
iteration cap, timeout and budget.

| Agent | Role | Tier | Budget cap | Notes |
|---|---|---|---|---|
| principal | PRINCIPAL | REASONING | $5 | vision, approvals, escalations |
| captain | ORCHESTRATOR | REASONING | $5 | decomposition & dispatch, 40 iters |
| product-manager | PRODUCT | STANDARD | $5 | PRD, stories, acceptance criteria |
| requirements-engineer | PRODUCT | STANDARD | $5 | SRS, edge cases, Definition of Ready |
| architect | ARCHITECTURE | REASONING | $5 | C4, ADRs, threat models |
| staff-engineer | ENGINEERING | REASONING | $5 | deep modules, cross-cutting refactors |
| frontend-engineer | ENGINEERING | STANDARD | $5 | accessible UIs + e2e checks |
| backend-engineer | ENGINEERING | STANDARD | $5 | APIs/services with TDD |
| database-engineer | DATA | STANDARD | $5 | reversible migrations only |
| devops-engineer | PLATFORM | STANDARD | $5 | CI/CD, IaC; staging deploys |
| sre | PLATFORM | STANDARD | $5 | SLOs, runbooks, error budgets |
| qa-engineer | QUALITY | STANDARD | $5 | coverage ≥80/60 gate ownership |
| security-engineer | SECURITY | SECURITY | $5 | threat modeling, finding triage |
| performance-engineer | QUALITY | STANDARD | $5 | benchmarks before/after |
| release-manager | RELEASE | STANDARD | $5 | SemVer, changelogs, rollback plans |
| documentation-engineer | DOCS | FAST | $5 | Diataxis coverage map |
| code-reviewer | REVIEW | REVIEW | $5 | standards axis; cannot commit |
| adversarial-reviewer | REVIEW | REASONING | $5 | spec-fidelity axis; tries to break changes |
| research-agent | RESEARCH | FAST | $5 | cited claims: source/date/confidence |
| support-agent | SUPPORT | FAST | $5 | reproduction-first triage |
| finops-agent | FINANCE | FAST | $5 | budget breaches escalated same day |

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
