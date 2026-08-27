# Agency Workflow Review — Gap Analysis & Upgrade Plan

**Reviewer:** Enterprise Orchestrator (Professional Full-Stack)
**Scope:** Master-prompt "Enterprise AI Agency Orchestrator with find-skills" v1.0.0 + prior `PRODUCTION_GRADE_ROADMAP.md`
**Goal:** Make this repo an enterprise-grade, professional, corporate result via a *governed* skill pipeline.

## 1. What the master prompt gets right
- Cache-first leaderboard (avoid hot-path `npx find`) — good for latency/cost.
- Quality gate before recommendation (installs, stars, trusted source, SAST) — strong security posture.
- Version pinning + `skills.lock` commit — reproducible builds.
- Explicit worker-agent assignment (T1–T6) — clean delegation boundaries.
- Human-in-the-loop for <1K installs — compliance-friendly.

## 2. Gaps found (executed as upgrade suggestions)
| # | Gap | Risk if unaddressed | Upgrade |
|---|---|---|---|
| G1 | **No offline / air-gapped fallback.** Assumes `skills.sh` + Redis always reachable. This agency runs in a sandbox where network is optional. | Pipeline hard-fails when registry is down. | Add a **local skill registry** (`skills.lock` is source of truth) + `--owner` allowlist; `find` is a *refresh*, not a hard dependency. |
| G2 | **No harness adapter.** Step 7 assumes Claude Code/Cursor/LangGraph. This is opencode. | Delegation step is non-actionable. | Define a **harness adapter** that maps T1–T6 → AGENTS.md agent roster + `Task` subagents; governance enforced in the permission layer (already present). |
| G3 | **No measurable acceptance criteria per T-level.** "Task done" is a vague checklist. | Subjective "done", regressions slip. | Add **Definition of Done (DoD)** with thresholds (lint 0, typecheck 0, coverage, e2e, SAST) per tier. |
| G4 | **No FinOps / budget guardrail.** AGENTS.md has `finops-agent` + $ caps; master prompt ignores cost. | Runaway token/compute spend. | Add **budget check** step; escalate breaches same-day (per AGENTS.md). |
| G5 | **No accessibility / i18n requirement.** Enterprise buyers require WCAG 2.1 AA + locale readiness. | Fails procurement. | Add **a11y gate** (focus, contrast, aria) + i18n-ready strings to DoD. |
| G6 | **No PII / data-privacy handling** in skill execution. | Compliance breach (GDPR/SOC2). | Add **PII scan** step; skills must not exfiltrate; secrets stay in sessionStorage (already D1-fixed). |
| G7 | **No workflow self-review loop.** Step 11 updates skills, not the *process*. User explicitly wants the workflow itself reviewed & upgraded. | Process rot. | Add **M12: Workflow Retrospective** — review `skills.lock` + monitor output monthly, prune, upgrade. |
| G8 | **No observability of the pipeline.** User asked for "software that monitors the full workflow." | Blind execution. | Build **`scripts/workflow-monitor.mjs`** that enforces the 11-step checklist + repo quality gates and emits a health report. |
| G9 | **No rollback for skill regressions.** | Bad skill version ships to prod. | `skills.lock` is git-pinned; `npx skills update` runs in **staging only**, e2e must pass before merge (already in Step 11). |
| G10 | **Scope guardrails missing.** A T4 QA skill shouldn't touch prod DB. | Blast radius. | Bind each worker to its directory + tool matrix from AGENTS.md; destructive tools route through approval service. |

## 3. Upgrade decisions applied
- Adopt **local-first** governance: `skills.lock` is authoritative; `find` only *refreshes* candidates.
- Tiers map to this repo's agent roster (see `agency-workflow.md` §Delegation).
- DoD includes: `eslint` 0 errors, `tsc --noEmit` 0 errors, `vite build` success, backend `vitest` green, Playwright smoke (where browsers available), secret/PII scan clean.
- The monitor script is the "software" the user requested; it is reviewed (M12) and then run against the repo.

## 4. Next
See `agency-workflow.md` (upgraded v2 pipeline) and `scripts/workflow-monitor.mjs`.
