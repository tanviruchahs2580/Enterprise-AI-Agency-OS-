-- 0003: atomic idempotency — Phase A / F-02
CREATE UNIQUE INDEX IF NOT EXISTS ux_idem_scope_key
  ON idempotency_keys(org_id, scope, key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_jobs_idem_key
  ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
