# DEPLOYMENT VERIFICATION

## What was deployed and verified

### Local live boot (this machine, 2026-08-24)

```
node apps/control-plane/src/server.ts   (ADMIN_BOOTSTRAP_KEY set)
```

| Check | Result |
|---|---|
| Process boots, binds 127.0.0.1:3000 | PASS (log: "control plane listening") |
| GET /health | `{"status":"ok","service":"control-plane"}` |
| GET /ready | database ok, DLQ count, sandbox provider reported |
| GET /api/v1/meta with bearer key | version 0.1.0 + feature flags |
| Admin key bootstrap | printed once; hashed at rest |
| Agent roster seed | 21 agents |
| Graceful shutdown | SIGINT/SIGTERM handlers close app + stop workers |

Repeated across lint/type/test cycles and the perf baseline run.

### Cloud CI execution (GitHub-hosted runners)

- ci.yml run 32746089979 — SUCCESS on ubuntu-latest AND windows-latest:
  install → lint → typecheck → full test suite → dashboard build → self-test →
  production-gate negative check.
- security.yml run 32746415175 — SUCCESS: gitleaks + npm audit + SBOM artifact.
- release.yml on tag v0.1.0 — SUCCESS: re-ran full validation, generated SBOM,
  published GitHub Release with sbom-v0.1.0.json.

### Container deployment

`docker/Dockerfile.control-plane` + `Dockerfile.dashboard` +
`docker-compose.yml` (profiles: core / postgres / observability) are shipped,
pinned to digest-stable base tags, non-root runtime user, healthchecks defined.
**BLOCKED**: no Docker daemon exists on this build host, so image builds could
not be executed here. Verification requires any container-capable host:

```
docker compose --profile postgres up -d --build
curl -f http://localhost:3000/health
```

### Post-deployment smoke checklist (executed locally)

health → ready → meta → auth 401/403 paths → project create → task graph →
dispatch → worker execution → artifact/cost/audit present → rollback flow →
SSE endpoint negotiation. All green (see docs/TEST-RESULTS.md).
