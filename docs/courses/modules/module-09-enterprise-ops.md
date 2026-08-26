# Module 09 — Enterprise Operations & Scale

> Duration: ~95 min · Prerequisites: M06–M08 · Produces: firm rollout memo

## Learning objectives

1. Convert personal skill into a governed firm capability with three sources of truth.
2. Operate QA gates, cost controls, and security ops as routine, not heroics.
3. Onboard new designers in days via certification gates.

---

## Lesson 9.1 — Standardization assets (20 min)

The firm maintains exactly three version-controlled sources of truth:

```
workflows/    RenderForge + IdeaForge masters (semver + changelog)
library/      facade catalog · design moves · snippets · palettes · style refs
governance/   policy · naming · disclosure templates · license notes
```

Change control:

- Masters merge only via viz lead review (PRs; yes, prompts live in git — they are production assets)
- Contributors propose additions as library PRs (catalog entries, moves, snippets) — never direct master edits
- Every batch of catalog additions = patch bump; rewrites of existing phrases = minor bump

Why git for prompts: diffs show exactly what changed between quality shifts; history answers "which master version made the Q3 renders?"; branches let you A/B a new bank option safely.

## Lesson 9.2 — Pre-send QA gate (15 min)

Two reviewers, checklist-driven (`templates/qa-gate-checklist.md`):

☐ Geometry claims traceable ☐ Disclosure present ☐ Provenance archived (prompt+inputs+id+log)
☐ Set consistency pass ☐ Licensing/watermarks clean ☐ Credits logged ☐ Naming convention met

Reviewer roles: **R1 = producer** (self-check), **R2 = independent** (never reviewed own work in this package). Failures return with checklist item numbers, not vibes.

## Lesson 9.3 — Cost governance (15 min)

- Monthly credit budget per team; rollup from generation logs (no separate accounting)
- Alert at 80% burn → halt non-billable generation until reviewed
- Breach escalates same day to budget owner (mirrors finops discipline: boring numbers reported early keep programs alive)
- Quarterly calibration re-run (M03 protocol): model pricing and quality shift; stale forecasts rot trust

Budget line template:

| Team | Month | Forecast | Actual | Δ | Action |
|---|---|---|---|---|---|
| viz | 2026-09 | 12,000 cr | — | — | alert@80% |

## Lesson 9.4 — Security & confidentiality ops (15 min)

- Workspace access role-based; freelancers get project-scoped seats only
- Offboarding checklist: seat removal + archive audit + policy acknowledgment on file
- Incident path (links to firm IR runbook):
  suspected confidential-input leak → disable seat → stop project uploads → notify DPO/client per contract → postmortem filed to `00_GOVERNANCE/incidents/`

Drill annually: 30-minute tabletop using the Module 4 escalation table.

## Lesson 9.5 — Onboarding new designers (20 min)

```
Day 1    Modules 00–04   governance FIRST — no tool access before policy signature
Day 2–3  Modules 05–06   supervised labs on internal (non-client) project
Week 2   first solo sprint (Workflow B), output QA'd by viz lead
Certification = Gate 6 + Gate 7 passed on real internal project
```

Onboarding artefact kit (pre-staged per hire): studio folder tree, log CSV, master templates at current versions, policy one-pager for signature, this course package link.

Time-to-first-deliverable target: ≤10 business days from start.

## Lesson 9.6 — KPI dashboard (15 min)

| KPI | Definition | Healthy range | Source |
|---|---|---|---|
| Time-to-first-package | brief → 5-concept sheet | < 1 business day | sprint worksheets |
| Explore acceptance rate | keepers ÷ explore outputs | > 25% | log rollup |
| Craft acceptance rate | approved ÷ craft passes | > 75% | log rollup |
| Cost per delivered hero | credits ÷ finals shipped | trending down quarterly | logs × rates |
| Reproducibility audit pass | sampled finals regenerable | 100% | monthly sample of 3 |
| Rework rate | delivered items needing re-render | < 10% | QA gate returns |

Review cadence: weekly ops standup reads acceptance + burn; monthly leadership reads cost-per-hero + reproducibility.

---

## Gate 9

- [ ] Rollout memo drafted (1 page): standards locations, QA flow, budget owner + thresholds, onboarding plan, KPI cadence
- [ ] Repositories created (workflows/library/governance) with current templates committed
- [ ] First two-person QA cycle executed on any Gate 6/7 deliverable
- [ ] Calibration scheduled in calendar (quarterly recurring)

## Quiz

1. Why do prompts belong in git?
2. Who is R2 and what must they NOT have done?
3. Burn hits 85% on the 12th. What happens today?

<details><summary>Answers</summary>
1. Diffs, provenance across time, safe A/B branching of production prompt assets.
2. Independent second reviewer who did not produce this package.
3. Non-billable generation halts pending budget-owner review; escalation same day.
</details>

**Next:** Module 10 — Capstone.
