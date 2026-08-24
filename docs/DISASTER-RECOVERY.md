# DISASTER-RECOVERY

## Objectives

| Metric | Target | Notes |
|---|---|---|
| RPO | ≤ 24h (local) / ≤ 5min (managed Postgres) | driven by backup cadence / WAL archiving |
| RTO | ≤ 1h | restore + boot + smoke test |

## Failure scenarios & recovery

### 1. Control plane crash

Symptom: `/health` unreachable.
Recovery: restart process/container. Jobs resume from `run_after`; workflow runs
resume via `advance()`/`resume()`. No data loss beyond in-flight request.

### 2. Database loss/corruption

1. Stop control plane.
2. Restore latest verified backup (OPERATIONS.md).
3. `node scripts/migrate.mjs` — must report 0 pending, no checksum drift.
4. Boot, then run `/audit/verify` — a broken chain indicates post-backup tampering
   or partial loss; document the gap window as an incident.

RPO impact: rows created after the last backup are lost; audit chain will show
the discontinuity honestly rather than hiding it.

### 3. Model provider outage

Automatic: circuit breaker opens → fallback candidate → recorded fallback.
Manual: none needed. Verify with `GET /api/v1/models` health and recent
`model_requests` statuses.

### 4. Docker daemon failure (production sandbox)

Dispatches fail safely into retries/dead-letter. Restart dockerd; requeue
dead-letter jobs if needed. The API itself keeps serving.

### 5. Secret compromise

1. Revoke the key (`api_keys.revoked_at`) — takes effect immediately.
2. Issue replacement keys; update OpenCode/MCP configs.
3. If provider keys leaked: rotate at the provider; check `model_requests` and
   cost summary for anomalous spend during the exposure window.

### 6. Machine/host loss

Provision new host → clone repo → restore `.env` from secret manager →
restore database backup → `npm ci && node scripts/migrate.mjs && node scripts/seed.mjs`
→ point DNS/proxy → verify with self-test + `/ready`.

## Recovery testing schedule

| Drill | Frequency |
|---|---|
| Backup restore into scratch env | quarterly + after schema changes |
| Provider outage simulation | covered by automated tests continuously |
| Audit chain verify | after any incident + monthly |
