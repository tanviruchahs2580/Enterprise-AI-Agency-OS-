# Style Guide v1.0 — Engineering Standards

| | |
|---|---|
| **Document** | `docs/engineering/style-guide.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | Tech Lead (staff-engineer), **Accountable: Architect** |

## 1. Toolchain (enforced via pre-commit + CI)

- **Formatter:** `prettier` (single quotes, 100-char print width) — run via `npx prettier --write .` (Phase 3 adds to CI).
- **Linter:** `eslint` (`eslint .`) — `typescript-eslint` recommended + rules below. **CI blocks on fail.**
- **Types:** `tsc -b` strict — no `any` without justification (`// eslint-disable` requires ticket `PROJ-###`).

## 2. Budgets — complexity, size, diff

| Budget | Limit | Enforcement | Rationale |
|---|---|---|---|
| **Cyclomatic complexity** | **≤10** per function (target) | `eslint: complexity: ["warn", 10]` — warn in CI now, **error after Phase 3 refactor** (grandfathered `executeDelivery:58` tracked as TD) | Keeps branches testable; >10 must be decomposed |
| **Function size** | ≤50 lines | Review checklist (Phase 3) | Readability, single responsibility |
| **File size** | ≤400 lines | Review checklist | Bounded diffs |
| **PR diff** | **≤400 lines** | `CODEOWNERS` + review gate; `>400` flag → decompose | Review quality (DORA) |
| **Branch lifetime** | ≤3 days | Orchestrator WIP check | Trunk-based flow |

- **Complexity escape hatch:** `// eslint-disable-next-line complexity -- PROJ-123: reason` with ticket link; must be `A` by Tech Lead.

## 3. Imports

- `consistent-type-imports: error` — `import type` for types.
- **Module boundaries:** `packages/orchestration` must not import `apps/control-plane` (future `import/no-restricted-paths`).

## 4. Pre-commit hooks

```bash
# install once
npm run prepare  # sets .husky/pre-commit → lint + typecheck on staged files
```

Hook (`.husky/pre-commit`): `npx lint-staged` → `eslint --fix` + `prettier` on staged `*.ts`. CI is the source of truth — hooks are courtesy.

## 5. Conventional Commits + SemVer

- `feat|fix|docs|refactor|test|chore(scope): PROJ-### — title`
- SemVer per `CHANGELOG.md` (Keep a Changelog); `main` tags `vX.Y.Z`.
- One concern per PR (Hard Rule 6).

## 6. Change log

- v1.0 — initial style guide (complexity 10, diff 400)
