# RELEASE CHECKLIST — v0.1.1

## Code & tests
- [x] Full suite green locally (43/43)
- [x] Coverage ≥ 80% line / ≥ 60% branch (90.9 / 80.6)
- [x] Lint + typecheck clean
- [x] New regressions covered (tenant isolation, worker flow, rollback,
      approval expiry, concurrency, payload bug)

## Security
- [x] gitleaks CI SUCCESS
- [x] npm audit prod graph: 0 vulnerabilities
- [x] react-router upgraded 6.26 → 7.18.2 (security-driven)
- [x] Accepted risks documented (esbuild dev-only)
- [x] No secrets in diff; .env git-ignored

## Build & deploy artifacts
- [x] Dashboard production build green
- [x] Dockerfiles + compose reviewed; healthchecks defined
- [ ] Container build executed on a Docker-capable host ← external step

## GitHub
- [x] Conventional Commits history
- [x] CI matrix success (ubuntu+windows)
- [x] Security workflow success
- [x] Release v0.1.0 published with SBOM (release.yml verified end-to-end)

## Docs
- [x] All Phase-44 reports present with real evidence
- [x] PROGRESS.md updated
- [x] CHANGELOG entry for fixes
