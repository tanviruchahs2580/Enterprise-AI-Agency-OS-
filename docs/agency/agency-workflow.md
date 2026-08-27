# Agency Workflow — Governed Skill Pipeline (v2, upgraded)

> Upgraded from master-prompt v1.0.0 to close gaps G1–G10 (see `workflow-review.md`).
> This repo's source of truth for agent behavior remains `AGENTS.md`; this file is the *operating procedure*.
> The pipeline is enforced/observed by `scripts/workflow-monitor.mjs`.

## Principles
1. **Local-first.** `skills.lock` is authoritative. `npx skills find` only *refreshes* candidates; it is never a hard dependency (G1).
2. **Gated by trust.** No install unless owner in `trusted_owners`, installs ≥ `min_installs`, stars ≥ `min_stars`, and SAST passes (G6).
3. **Harness-aware.** Delegation maps to this repo's agent roster via the `Task` tool / subagents (G2).
4. **Done is measurable.** Each tier has a Definition of Done; the monitor enforces it (G3).
5. **Cost & privacy bound.** FinOps budget check + PII scan every run (G4, G6).
6. **Observable & self-improving.** Monitor emits a health report; pipeline self-reviews monthly (M12) (G7, G8).

## Phase 0 — Foundation (one-time)
- `skill-governance.yaml` present (allowlist, thresholds, require_sast, budget).
- `skills.lock` committed (pinned, verified skills only).
- `scripts/workflow-monitor.mjs` present and runnable (`node scripts/workflow-monitor.mjs`).
- Agent roster = `AGENTS.md` (already seeded; 20+ contracts).

## Phase 1 — The 12-Step Pipeline (M1 added; M12 added)
| Step | Action | Gate / Output |
|---|---|---|
| **S1** | Decompose task → Domain + T-tier | `Domain`, `Tier`, `Existing skill?` |
| **S2** | Cache-first: read `skills.lock` + leaderboard snapshot | hit → skip to S5; miss → S3 |
| **S3** | `npx skills find "<query>" --owner <trusted>` (refresh only) | candidate list |
| **S4** | Quality verify: installs, stars, trusted source, **SAST + PII scan** | PASS → S5; FAIL → quarantine + notify Architect |
| **S5** | Present options (name, fn, installs, stars, safety, pinned cmd) | audit log entry |
| **S6** | Install pinned `-g -y` **only if approved**; record in `skills.lock` | version-pinned entry |
| **S7** | Delegate to worker (T1–T6 → AGENTS.md agent + `Task` subagent) | assignment record |
| **S8** | Execute with guardrails (directory + tool matrix from AGENTS.md) | code in monorepo |
| **S9** | Automated review: lint, typecheck, **e2e**, SAST, **budget check (FinOps)** | green / loop |
| **S10** | Deploy (canary) + docs (Swagger/CHANGELOG) + `skills.lock` commit | shipped |
| **S11** | Feedback: staging `npx skills update` + e2e, auto-merge on pass | metrics |
| **M12** | **Workflow retrospective:** review monitor report + `skills.lock`; prune <10-use; upgrade process | next-iteration diff |

## Definition of Done (per tier)
- **All tiers:** `eslint .` 0 errors · `tsc --noEmit` 0 errors · secret/PII scan clean · budget not exceeded.
- **T2 Frontend:** `vite build` success · responsive (mobile 360px) · a11y: keyboard nav + focus ring + aria-labels · no console errors.
- **T3 Backend:** backend `vitest` green · org-isolation verified · migrations reversible.
- **T4 QA:** Playwright smoke passes where browsers available (else build-smoke + manual checklist).
- **T5 DevOps:** image builds; canary plan documented.
- **T6 Docs:** CHANGELOG + README updated; API doc generated.

## Delegation matrix (harness adapter → AGENTS.md)
| Tier | Agent (AGENTS.md) | Suggested skill (verified) |
|---|---|---|
| T1 System/Architecture | `architect`, `staff-engineer` | (internal ADRs) |
| T2 Frontend | `frontend-engineer` | `vercel-labs/agent-skills@vercel-react-best-practices` (667K, trusted) |
| T2 a11y | `frontend-engineer` | `addyosmani/web-quality-skills@accessibility` (47.8K, trusted) |
| T3 Backend/API sec | `backend-engineer`, `security-engineer` | `sickn33/agentic-awesome-skills@api-security-best-practices` (8.4K) |
| T4 QA | `qa-engineer` | `bobmatnyc/claude-mpm-skills@playwright-e2e-testing` (2.8K, pending SAST) |
| T5 DevOps | `devops-engineer`, `sre` | `mrgoonie/claudekit-skills@devops` (962 — **<1K, human approval required**) |
| T6 Docs | `documentation-engineer` | `giuseppe-trisciuoglio/developer-kit@docs-updater` (2.2K, pending SAST) |

## Security & compliance (non-negotiable)
- Never auto-install untrusted owner. Always pin + commit `skills.lock`.
- `<1K` installs → quarantine + human approval (per AGENTS.md approval service).
- Destructive/high-risk tools route through the permission/approval layer (already enforced).
- API key stays in `sessionStorage` (D1-fixed); no secrets in `localStorage` or logs.
