CREATE TABLE IF NOT EXISTS delivery_stages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  idx INTEGER NOT NULL,
  state TEXT NOT NULL,
  detail TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_stages_exec ON delivery_stages(execution_id);
