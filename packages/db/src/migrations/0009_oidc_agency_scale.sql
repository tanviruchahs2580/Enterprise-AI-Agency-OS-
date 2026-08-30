-- Audit Phases 2-4: OIDC/SSO identities, per-org skill customization,
-- skill feedback loop, A2A protocol cards, and per-workspace encrypted data keys.
CREATE TABLE IF NOT EXISTS oidc_users (
  id TEXT PRIMARY KEY,
  sub TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT NOT NULL DEFAULT '',
  org_id TEXT NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL DEFAULT 'VIEWER',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_oidc_users_org ON oidc_users(org_id);
CREATE INDEX IF NOT EXISTS idx_oidc_users_email ON oidc_users(email);

-- Per-org skill customization (audit Phase 4): overlay definitions merged over
-- the default workload registry when the owning org opts in.
CREATE TABLE IF NOT EXISTS org_skill_overrides (
  org_id TEXT NOT NULL REFERENCES organizations(id),
  skill_name TEXT NOT NULL,
  definition TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, skill_name)
);

-- Skill feedback loop (audit Phase 4): one row per verified execution so the
-- agency can measure which skills succeed per task type and client.
CREATE TABLE IF NOT EXISTS skill_executions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  skill_name TEXT NOT NULL,
  task_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failed', 'skipped')),
  duration_ms INTEGER,
  cost_usd REAL,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_skill_exec_org_skill ON skill_executions(org_id, skill_name);
CREATE INDEX IF NOT EXISTS idx_skill_exec_started ON skill_executions(started_at);

-- A2A protocol (audit Phase 4): inter-agency TaskCards (v0.1), inbound/outbound.
CREATE TABLE IF NOT EXISTS a2a_cards (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'accepted', 'working', 'completed', 'failed', 'cancelled')),
  card_json TEXT NOT NULL,
  partner TEXT,
  ack_token TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_a2a_cards_org ON a2a_cards(org_id, created_at);

-- Per-workspace encryption (audit Phase 4): the org's data-encryption key (DEK)
-- never appears in the clear — it is wrapped by the ENCRYPTION_MASTER_KEY.
CREATE TABLE IF NOT EXISTS org_data_keys (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id),
  version INTEGER NOT NULL DEFAULT 1,
  wrapped_dek TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  created_at TEXT NOT NULL,
  rotated_at TEXT
);