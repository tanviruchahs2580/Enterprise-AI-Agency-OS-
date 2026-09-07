# Branching Model v1.0 — Trunk-Based

| | |
|---|---|
| **Document** | `docs/engineering/branching.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | Tech Lead, **Accountable: Architect** |

## 1. Model

- **Trunk:** `main` — always green, protected (no direct push; PR + 1 approval + green CI).
- **Branches:** `agency/PROJ-###-short-slug` (e.g., `agency/PROJ-042-stripe-refund`) — short-lived **≤3 days**, <400 lines diff.
- **Merge:** **squash merge** to `main` → single Conventional Commit on trunk; branch deleted after merge.

## 2. Lifecycle

1. `git checkout main && git pull`
2. `git checkout -b agency/PROJ-042-stripe-refund`
3. Commit(s) locally → pre-commit hooks run (lint+typecheck)
4. `git push -u origin agency/PROJ-042-stripe-refund` → open PR (template)
5. CI: `lint→typecheck→unit→build→e2e smoke` — all green
6. **Two-axis review** for high-risk (`G3`): `code-reviewer` (standards) + `adversarial-reviewer` (spec) — both approve
7. `CODEOWNERS` approval for touched areas (e.g., `packages/db/` → DBA)
8. Squash + merge → tag if release (`vX.Y.Z`)

## 3. Protected `main`

- GitHub branch protection: `Require PR`, `Require 1 approval`, `Require status checks (CI)`, `Dismiss stale reviews`, `Block force pushes`.
- Bypass logged (as seen at `86f2272..3aef4c0` push) — emergency only, post-incident review required.

## 4. Alternatives rejected

- GitFlow (long-lived `develop`) — rejected: overhead for solo + trunk-based faster DORA.
- Forking workflow — rejected: single repo, RACI clear.

## 5. Change log

- v1.0 — trunk-based, squash, 400-line diff budget
