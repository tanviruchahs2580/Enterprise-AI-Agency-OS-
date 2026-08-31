-- Agent workforce (Phase 2/4): auditable capability routing, evidence-backed
-- claims, and typed agent handoffs that survive restarts.
CREATE TABLE IF NOT EXISTS routing_decisions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  task_id TEXT,
  mission_id TEXT,
  required_capabilities TEXT NOT NULL DEFAULT '[]',
  preferred_agent TEXT,
  risk TEXT,
  primary_agent_id TEXT NOT NULL,
  candidates_json TEXT NOT NULL DEFAULT '[]',
  why_agent_selected TEXT NOT NULL DEFAULT '',
  policy_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_org ON routing_decisions(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_task ON routing_decisions(task_id);

-- Evidence-backed claims (master prompt §28): every completion claim must be
-- backed by a record of matching type. content_hash enables tamper detection.
CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  execution_id TEXT,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  claims TEXT NOT NULL DEFAULT '[]',
  content_location TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_org_type ON evidence_records(org_id, type);
CREATE INDEX IF NOT EXISTS idx_evidence_execution ON evidence_records(execution_id);

-- Typed agent handoffs (master prompt §13): requested -> produced -> remains,
-- with facts/assumptions separated and a confidence score driving review depth.
CREATE TABLE IF NOT EXISTS agent_handoffs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  mission_id TEXT,
  execution_id TEXT,
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  intent TEXT NOT NULL
    CHECK (intent IN ('decomposition', 'implementation', 'review', 'escalation', 'merge', 'release')),
  payload TEXT NOT NULL DEFAULT '{}',
  evidence TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL,
  assumptions TEXT NOT NULL DEFAULT '[]',
  unresolved_questions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_handoffs_org ON agent_handoffs(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_handoffs_receiver ON agent_handoffs(receiver, created_at);