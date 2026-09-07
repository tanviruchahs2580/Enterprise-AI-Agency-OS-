## Summary

<!-- What and why. Link the issue/requirement this satisfies. -->

## Type of change

- [ ] feat — new functionality
- [ ] fix — bug fix
- [ ] docs — documentation only
- [ ] refactor — no behavior change
- [ ] test — adding/updating tests
- [ ] chore — tooling/ci/build

## Branch / diff

- Branch: `agency/PROJ-###-slug` (trunk-based, ≤3 days)
- Diff size: ~ ___ lines (budget ≤400; >400 must be decomposed — `docs/engineering/style-guide.md`)

## Complexity

- [ ] No function exceeds **complexity 10** (or escape hatch `// eslint-disable-next-line complexity -- PROJ-###: reason` with Tech Lead approval)

## Governance & quality checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (incl. e2e smoke)
- [ ] Agency workflow monitor (`node scripts/workflow-monitor.mjs`) healthy
- [ ] No secrets committed (`.env`, `*.sqlite` ignored)
- [ ] RBAC / approval gates respected for any protected route
- [ ] Audit events emitted for state-changing actions

## Test plan

<!-- How was this verified? Commands run, endpoints hit, UI checked. -->

## Risk / blast radius

<!-- What could regress, and how is it contained? -->
