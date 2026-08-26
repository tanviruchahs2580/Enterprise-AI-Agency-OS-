-- 0002: approval consumption (single-use approvals) — Phase A / F-01
ALTER TABLE approvals ADD COLUMN consumed_at TEXT NULL;
CREATE INDEX idx_approvals_lookup
  ON approvals(org_id, action, resource_type, resource_id, decision);
