-- Audit Phase 1.2 & 2.2: agents gain a `skills` column (skill loader + roster
-- contract sync); `auth_sessions` backs httpOnly cookie sessions so browser
-- clients never persist API keys in storage.
ALTER TABLE agents ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  key_id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'VIEWER',
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_org ON auth_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);