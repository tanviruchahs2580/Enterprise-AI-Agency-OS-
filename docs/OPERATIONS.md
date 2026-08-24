# OPERATIONS

## Daily operations

| Task | How |
|---|---|
| System health | `GET /ready` (db, queue dead letters, sandbox, features) |
| Environment diagnostics | `node scripts/self-test.mjs` |
| Spend review | dashboard → Models & Cost, or `GET /api/v1/costs/summary` |
| Pending approvals | dashboard → Approvals |
| Audit spot check | `GET /api/v1/audit/verify` |

## Runbook: queue backlog growing

1. Check `GET /api/v1/jobs/stats` — compare pending vs dead_letter.
2. If workers crashed: restart control plane; jobs resume automatically
   (`run_after` backoff).
3. Poison job? Inspect `last_error`, then requeue:
   `POST`-equivalent: call `JobQueue.retryDeadLetter(jobId)` via a script.

## Runbook: model provider outage

The router trips the provider circuit breaker after repeated failures and falls
back across candidates. With only the mock provider configured, dispatches will
fail safely into retries → dead-letter. Add or restore a real provider by setting
`MODEL_PROVIDER_API_KEY` + `MODEL_PROVIDER_BASE_URL` and restarting.

## Runbook: audit chain broken

1. `GET /api/v1/audit/verify` returns the first broken `seq`.
2. Freeze writes to the database (snapshot first).
3. Compare rows at/before that seq against backups to identify tampering or
   corruption; treat as a security incident (SECURITY.md reporting).

## Backup & restore

### Database (SQLite local)

```sh
# backup (online-safe with WAL)
sqlite3 data/agencyos.sqlite ".backup 'backups/agencyos-$(date +%F).sqlite'"

# restore
cp backups/agencyos-2026-08-24.sqlite data/agencyos.sqlite
node scripts/migrate.mjs   # verify schema current
```

### Database (PostgreSQL)

```sh
pg_dump "$DATABASE_URL" > backups/agencyos-$(date +%F).sql
psql "$DATABASE_URL_RESTORE" < backups/agencyos-2026-08-24.sql
```

Encrypt backups at rest (age/gpg): encrypt immediately after dump, store keys
separately from backup media.

### What else to back up

| Artifact | Location | Frequency |
|---|---|---|
| `.env` (secret refs) | secret manager | on change |
| knowledge/artifacts volume | `agency-data` docker volume | daily |
| SBOM + release notes | GitHub Releases | per release |

### Restore verification (mandatory)

A backup is not "verified" until restored: restore into a scratch environment,
boot the control plane against it, run `/ready`, log in with a key derived from
the restored `api_keys` table, and run `/audit/verify`. Record the result in the
ops log. Schedule: quarterly, and after any migration change.

## Data retention & erasure

- Knowledge documents and artifacts support hard delete by id for right-to-erasure.
- Audit events are intentionally NOT deletable (integrity chain); redact metadata
  content instead by writing a compensating audit event documenting the erasure.
