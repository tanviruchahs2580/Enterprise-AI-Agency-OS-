-- 0004: distributed rate limit counters (Phase C1 / F-09)
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  org_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  route_class TEXT NOT NULL DEFAULT 'default',
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, key_hash, route_class)
);
