# INCIDENT RESPONSE RUNBOOK

## Severity ladder

| Sev | Definition | Response |
|---|---|---|
| S1 | API down / data loss / security breach | immediate, all hands |
| S2 | Degraded (queue stalled, provider outage w/o fallback) | same business hour |
| S3 | Minor (single dead-letter job, cosmetic) | next sprint |

## First 10 minutes (any incident)

1. `curl -fsS $HOST/health` and `/ready` — is it us or a dependency?
2. `GET /metrics` — error rate, queue depth, db_up.
3. `docker logs <cp-container> --tail 200` (or journald) — structured logs carry
   `error` fields with request ids.
4. If DB down → ROLLBACK-RUNBOOK §database; if bad deploy → rollback first,
   diagnose after.

## Playbooks

### Suspected data corruption / audit break
1. Freeze writes (stop control plane).
2. Snapshot storage volume.
3. `GET /api/v1/audit/verify` → note broken seq.
4. Compare against latest backup; treat divergence window as compromised.
5. Restore per OPERATIONS.md; re-verify chain; file security report
   (SECURITY.md reporting path).

### Runaway model spend
1. `agencyos_model_cost_usd_total` slope in Grafana AI dashboard.
2. Identify task/execution via `model_requests` recent rows.
3. Kill execution (`POST /api/v1/agents/:id/status {status:"paused"}`), tighten
   budget (`POST /api/v1/budgets`), rotate key if abuse suspected.

### Secret exposure
Rotate immediately (provider side + issue new agency keys, revoke old), then
follow SECURITY.md disclosure handling. Keys are hashed at rest — DB leak alone
does not expose them.

## Post-incident

Write a retro doc under `docs/incidents/YYYY-MM-DD-slug.md`: timeline, root
cause, detection gap, action items with owners. Add regression tests for every
code-level cause.
