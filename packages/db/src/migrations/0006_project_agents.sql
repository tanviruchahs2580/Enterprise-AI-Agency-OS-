CREATE TABLE IF NOT EXISTS project_agents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role_in_project TEXT NOT NULL DEFAULT 'member',
  added_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_project_agents_project ON project_agents(project_id);
