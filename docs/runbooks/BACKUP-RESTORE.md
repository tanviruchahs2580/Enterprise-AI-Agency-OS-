# Backup / Restore (executed both engines)
SQLite: Copy-Item data/agencyos.sqlite backup.sqlite; restore=copy back; verify counts MATCH (see FINAL-V2 §10)
Postgres: docker exec pg pg_dump -U agency agencyos > dump.sql; createdb restore; psql < dump.sql; row counts identical (projects/audit/keys/executions)
Cadence: daily local / WAL 5min managed-PG. Encrypt at rest; keep offsite copy.
