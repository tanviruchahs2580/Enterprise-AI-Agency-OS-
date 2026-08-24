# OPERATIONS RUNBOOK

## Daily signals

| Signal | Where | Healthy |
|---|---|---|
| Process alive | `GET /health` | 200 |
| Dependencies | `GET /ready` | database ok |
| Metrics | `GET /metrics` (Prometheus) | counters advancing, db_up=1 |
| Queue backlog | `agencyos_queue_jobs{status="pending"}` | near 0, drains |
| Dead letters | `…{status="dead_letter"}` or `/ready` field | 0 |
| Model spend | `agencyos_model_cost_usd_total` / dashboard Models page | inside budgets |
| Pending approvals | `agencyos_approvals_pending` / Approvals page | reviewed same day |
| Audit integrity | `GET /api/v1/audit/verify` | valid:true |

## Standard procedures

### Requeue a dead-letter job
Inspect `jobs.last_error`; fix root cause; requeue via script:
`JobQueue.retryDeadLetter(jobId)` (attempts reset, status→pending).

### Expire stale approvals
Automatic every 60s (`sweepExpiredApprovals`) — expired rows flip to
`expired` with an audit event. Manual trigger: call the function in a node one-liner.

### Worker crash recovery
Jobs locked by a dead worker are auto-reclaimed after 10 minutes
(`JobQueue.reclaimStale`, called from the worker loop). To force immediately:
call `reclaimStale(60_000)`.

### Add/remove API keys
Keys are hashed at rest. Create: `AuthService.createKey(orgId,name,role)` →
hand the material to the human once. Revoke: set `api_keys.revoked_at`.

## Backup & restore

SQLite (local):
```sh
sqlite3 data/agencyos.sqlite ".backup 'backups/agencyos-$(date +%F).sqlite'"
```
PostgreSQL (prod):
```sh
pg_dump "$DATABASE_URL" > backups/agencyos-$(date +%F).sql   # encrypt at rest
```
Restore drill (mandatory quarterly + after schema changes): restore into scratch,
boot control plane against it, run `/ready` + login + `/audit/verify`. A backup
without a verified restore is NOT a backup.

## Data retention

Knowledge/artifacts: hard-delete by id on request (GDPR). Audit rows are never
deleted (integrity chain) — redact metadata via compensating audit event.

## Incident quick reference

| Symptom | First action | Runbook |
|---|---|---|
| 5xx spike | check logs for error codes, `/ready` | DEPLOYMENT-RUNBOOK |
| Provider outage | breaker handles; verify fallbacks recorded | ROLLBACK-RUNBOOK §provider |
| Audit verify false | freeze writes, snapshot, compare vs backup | SECURITY-AUDIT-REPORT |
| Budget breach alert | finops review, adjust budgets | MODEL-ROUTING.md |
