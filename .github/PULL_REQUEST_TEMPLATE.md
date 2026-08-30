## Summary

<!-- What and why. Link the issue/requirement this satisfies. -->

## Type of change

- [ ] feat — new functionality
- [ ] fix — bug fix
- [ ] docs — documentation only
- [ ] refactor — no behavior change
- [ ] test — adding/updating tests
- [ ] chore — tooling/ci/build

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
