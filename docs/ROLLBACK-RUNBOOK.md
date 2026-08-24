# ROLLBACK RUNBOOK

## Application rollback (compose)

```sh
# list what's running
docker compose ps
# roll back to previous image tag/digest
docker compose down control-plane dashboard
git checkout v0.1.1          # or previous known-good tag
docker compose up -d --build
curl -fsS http://localhost:3000/ready
```

Bare-node: `git checkout <previous-tag> && npm ci && node scripts/migrate.mjs && restart service`.

## Database rollback policy

- Migrations are versioned + checksummed. **Forward-fix policy**: never edit an
  applied migration; write a new `000N_fix.sql` that reverses the change.
- If a bad migration shipped: restore from backup (OPERATIONS.md) into staging,
  verify, then repeat on production during a maintenance window.

## In-product deployment rollback

`POST /api/v1/deployments/:id/rollback` creates a corrective deployment row
(`rollback_of`) and marks the original `rolled_back`. Requires
`deployment:rollback` permission; audited at critical risk. Verified by e2e
(ROLLBACK test).

## Model provider failure

Automatic: circuit breaker opens → fallback candidate → every switch recorded in
`model_requests`. Manual: fix/restore credentials, restart not required.

## Bad release of the OS itself

1. Freeze: stop workers (`SIGTERM` — graceful, jobs stay queued)
2. Roll back code per above; migrations unchanged unless the release added one
   (then apply the forward-fix migration from the new tag)
3. `/ready` + smoke checklist (DEPLOYMENT-RUNBOOK.md §Post-deploy smoke)
4. Post-mortem note appended to CHANGELOG

## Verification drill (quarterly)

Execute a full rollback on staging and record evidence in the ops log.
