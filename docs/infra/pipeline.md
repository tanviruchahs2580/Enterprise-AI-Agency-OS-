# Pipeline v1.0 — Immutable Artifact

| | |
|---|---|
| **Document** | `docs/infra/pipeline.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | DevOps, **Accountable: Tech Lead (G3)** |

## 1. Stages (one-click, §5 Phase 4)

```
lint → typecheck → unit → build → integration → e2e smoke → security scan → publish
```

| Stage | Command | Gate |
|---|---|---|
| lint | `npm run lint` (eslint, complexity warn) | error blocks PR |
| typecheck | `npm run typecheck` (`tsc -b`) | error blocks |
| unit | `npm test` (235 tests, `--test`) | fail blocks |
| build | `npm run build --workspace @agency/dashboard` | fail blocks |
| integration | `node scripts/self-test.mjs` + `docs-check` | fail blocks |
| e2e smoke | `playwright test` (top 5 journeys) | fail blocks |
| security scan | `gitleaks` + `trivy` (docker.yml) | crit/high blocks (Phase 6) |
| publish | `docker buildx + sbom-v*.json` → immutable tag `vX.Y.Z` + `sbom` artifact | on tag `v*` |

Implemented in `.github/workflows/ci.yml` + `docker.yml` + `security.yml` + `release.yml` (tag `v*` → `softprops/action-gh-release`).

## 2. Immutable artifacts

- **Tag:** `vX.Y.Z` (SemVer) → `sbom-vX.Y.Z.json` + non-root image `agency-os:vX.Y.Z` (never `latest` in prod).
- **Proven:** `v0.12.0` published with SBOM, 5 workflows green (CI, Docker tag+main, Security, Release).

## 3. Change log

- v1.0 — pipeline as-implemented (matches live `v0.12.0` green)
