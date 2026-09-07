# Runbook v1.0 — Rollback (Blue-Green)

| | |
|---|---|
| **Document** | `docs/runbooks/rollback.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | DevOps + SRE, **Accountable: Human (G5)** |

## 1. Triggers (automated)

- SLO breach (p95 >500ms or error budget burn) → auto rollback (Phase 4, after SLO loop in Phase 7).
- Manual: `POST /api/v1/deployments/:id/rollback` (creates `vX.Y.Z-rollback`).

## 2. Steps — rehearsed (exit criteria)

1. `POST /deployments/:id/rollback` → new deployment row `rolled_back`.
2. Blue-green: shift traffic to `blue` (previous `vX.Y.Z-1`), health `http://staging:3000/ready` → `ready.status=ready`.
3. DB migrations: **expand-contract** — `up` is additive, `down` is post-cutover (no destructive `db.migrate` without approval).
4. Verify: `agencyos_build_info{version="vX.Y.Z-1"} 1` + smoke `npm run e2e`.
5. Postmortem ≤48h → `postmortems/` + ticket `PROJ-###`.

## 3. One-click rehearsal (Phase 4 exit)

```bash
npm run build && docker compose up -d && npm test && ./scripts/rollback-drill.sh
```

Last rehearsal: `v0.12.0` green (CI 5/5, Docker, Security, Release) — rollback path exists via `app.ts:2070`.

## 4. Change log

- v1.0 — initial rollback runbook (expand-contract)
