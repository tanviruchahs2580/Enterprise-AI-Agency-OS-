-- Enterprise AI Agency OS — schema v1
-- Portable SQL (SQLite dialect; PostgreSQL-compatible subset).

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER','PRINCIPAL','ADMIN','CTO','TECH_LEAD','ENGINEER','QA','SECURITY','DEVOPS','VIEWER','AUDITOR')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_users_org ON users(org_id);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]', -- JSON array
  last_used_at TEXT,
  revoked_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_api_keys_org ON api_keys(org_id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','discovery','requirements','architecture','ready','active','completed','blocked','cancelled')),
  repo_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  created_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, -- optimistic locking
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (org_id, slug)
);
CREATE INDEX idx_projects_org_status ON projects(org_id, status);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','in_progress','blocked','completed','failed','cancelled')),
  budget_usd REAL NOT NULL DEFAULT 0,
  spent_usd REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_missions_project ON missions(project_id, status);

CREATE TABLE workstreams (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  mission_id TEXT REFERENCES missions(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_workstreams_project ON workstreams(project_id);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  allowed_tools TEXT NOT NULL DEFAULT '[]',   -- JSON
  forbidden_tools TEXT NOT NULL DEFAULT '[]', -- JSON
  model_policy TEXT NOT NULL DEFAULT '{}',    -- JSON: tier, maxCostUsd…
  max_iterations INTEGER NOT NULL DEFAULT 25,
  timeout_ms INTEGER NOT NULL DEFAULT 600000,
  budget_usd REAL NOT NULL DEFAULT 5.0,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','busy','paused','failed','retired')),
  heartbeat_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, name)
);
CREATE INDEX idx_agents_org_role ON agents(org_id, role);

CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  task_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','completed','failed','resumed')),
  checkpoint_json TEXT NOT NULL DEFAULT '{}',
  handoff_json TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX idx_agent_sessions_agent ON agent_sessions(agent_id, status);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  workstream_id TEXT REFERENCES workstreams(id),
  mission_id TEXT REFERENCES missions(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'implementation',
  priority INTEGER NOT NULL DEFAULT 3, -- 1 highest … 5 lowest
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','ready','planned','in_progress','review','qa','security','approval','deploying','deployed','monitoring','completed','blocked','failed','rollback_required','cancelled'
  )),
  assignee_agent_id TEXT REFERENCES agents(id),
  branch TEXT,
  quality_receipt TEXT, -- JSON hash-chained receipt
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_agent_id, status);

CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'blocks',
  created_at TEXT NOT NULL,
  UNIQUE (task_id, depends_on_task_id)
);
CREATE INDEX idx_task_deps_on ON task_dependencies(depends_on_task_id);

CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  session_id TEXT REFERENCES agent_sessions(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','timeout','cancelled')),
  attempt INTEGER NOT NULL DEFAULT 1,
  trace_id TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  output_summary TEXT,
  error_code TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  sandbox_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_executions_task ON executions(task_id, status);
CREATE INDEX idx_executions_trace ON executions(trace_id);

CREATE TABLE worktrees (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('creating','created','merged','conflict','removed')),
  created_at TEXT NOT NULL,
  removed_at TEXT
);
CREATE INDEX idx_worktrees_task ON worktrees(task_id);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  task_id TEXT REFERENCES tasks(id),
  execution_id TEXT REFERENCES executions(id),
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_artifacts_task ON artifacts(task_id);

CREATE TABLE requirements (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  ref TEXT NOT NULL,          -- e.g. REQ-0007
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','implemented','validated','rejected')),
  source TEXT NOT NULL DEFAULT 'manual',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, ref)
);
CREATE INDEX idx_requirements_project ON requirements(project_id, status);

CREATE TABLE requirement_links (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (requirement_id, entity_type, entity_id)
);

CREATE TABLE architecture_decisions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  adr_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('proposed','accepted','superseded','rejected')),
  context TEXT NOT NULL,
  decision TEXT NOT NULL,
  consequences TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, adr_number)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  reviewer_agent_id TEXT REFERENCES agents(id),
  axis TEXT NOT NULL DEFAULT 'standards' CHECK (axis IN ('standards','spec','security','adversarial')),
  verdict TEXT NOT NULL CHECK (verdict IN ('pass','fail','changes_requested')),
  findings TEXT NOT NULL DEFAULT '[]',
  score REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_reviews_task ON reviews(task_id);

CREATE TABLE quality_gates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE gate_results (
  id TEXT PRIMARY KEY,
  gate_id TEXT NOT NULL REFERENCES quality_gates(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  passed INTEGER NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_gate_results_task ON gate_results(task_id);

CREATE TABLE security_findings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','info')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cve TEXT,
  tool TEXT NOT NULL DEFAULT 'internal',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','triage','investigating','mitigated','accepted','false_positive')),
  detected_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX idx_findings_org_severity ON security_findings(org_id, severity, status);

CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
  strategy TEXT NOT NULL DEFAULT 'rolling' CHECK (strategy IN ('rolling','blue_green','canary')),
  version TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','deploying','succeeded','failed','rolled_back','rolled_forward')),
  rollback_of TEXT REFERENCES deployments(id),
  health_score REAL,
  deployed_by TEXT NOT NULL,
  approval_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_deployments_project_env ON deployments(project_id, environment, status);

CREATE TABLE deployment_events (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE INDEX idx_deployment_events_dep ON deployment_events(deployment_id);

CREATE TABLE model_providers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'openai_compatible' CHECK (kind IN ('mock','openai_compatible')),
  base_url TEXT NOT NULL DEFAULT '',
  secret_ref TEXT,             -- secrets_metadata reference — never material
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  circuit_state TEXT NOT NULL DEFAULT 'closed' CHECK (circuit_state IN ('closed','open','half_open')),
  created_at TEXT NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES model_providers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  model_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('FAST','STANDARD','REASONING','REVIEW','SECURITY','VISION','LOCAL')),
  capabilities TEXT NOT NULL DEFAULT '[]',
  context_window INTEGER NOT NULL DEFAULT 128000,
  input_cost_per_1k REAL NOT NULL DEFAULT 0,
  output_cost_per_1k REAL NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  health_status TEXT NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy','degraded','unavailable')),
  created_at TEXT NOT NULL,
  UNIQUE (provider_id, alias)
);
CREATE INDEX idx_models_tier ON models(tier, enabled);

CREATE TABLE model_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  request_id TEXT NOT NULL,
  trace_id TEXT,
  requested_model TEXT NOT NULL,
  selected_model TEXT NOT NULL,
  provider TEXT NOT NULL,
  fallback_reason TEXT,
  tier TEXT,
  latency_ms INTEGER,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  fallback_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed','timeout','rate_limited','budget_blocked','cancelled')),
  error_code TEXT,
  redacted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_model_requests_org_time ON model_requests(org_id, created_at);

CREATE TABLE cost_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('request','task','mission','project','org','global')),
  scope_id TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  reason TEXT NOT NULL,
  model_request_id TEXT REFERENCES model_requests(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cost_events_scope ON cost_events(scope_type, scope_id, created_at);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('task','mission','project','org','daily','monthly')),
  scope_id TEXT NOT NULL DEFAULT '*',
  limit_usd REAL NOT NULL,
  action TEXT NOT NULL DEFAULT 'block' CHECK (action IN ('block','downgrade','approve_required')),
  created_at TEXT NOT NULL,
  UNIQUE (org_id, scope_type, scope_id)
);

CREATE TABLE audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  org_id TEXT REFERENCES organizations(id),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  request_id TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  decision TEXT NOT NULL DEFAULT 'allow' CHECK (decision IN ('allow','deny','approve','reject')),
  result TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success','failure')),
  metadata TEXT NOT NULL DEFAULT '{}',
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_org_seq ON audit_events(org_id, seq);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('medium','high','critical')),
  requested_by TEXT NOT NULL,
  approver_id TEXT,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected','expired')),
  decided_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_approvals_pending ON approvals(org_id, decision);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  channel TEXT NOT NULL DEFAULT 'inbox',
  topic TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_unread ON notifications(org_id, read_at);

CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('fact','assumption','decision','hypothesis','observation','failure','operational','handoff')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.5,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','contradicted')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_knowledge_project ON knowledge_documents(project_id, kind);

CREATE TABLE knowledge_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding_ref TEXT
);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('enabled','disabled','error')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, kind, name)
);

CREATE TABLE secrets_metadata (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'env',
  key_ref TEXT NOT NULL,
  rotated_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  source_target TEXT NOT NULL,
  event_type TEXT NOT NULL,
  signature_verified INTEGER NOT NULL DEFAULT 0,
  payload_hash TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','failed','dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX idx_webhook_events_status ON webhook_events(status, next_retry_at);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  queue TEXT NOT NULL DEFAULT 'default',
  job_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','dead_letter','cancelled')),
  run_after TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  idempotency_key TEXT,
  last_error TEXT,
  locked_by TEXT,
  locked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_jobs_poll ON jobs(status, run_after, queue);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  workflow_name TEXT NOT NULL,
  current_stage TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','waiting_approval','succeeded','failed','blocked','cancelled')),
  state_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_workflow_runs_project ON workflow_runs(project_id, status);

CREATE TABLE domain_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  org_id TEXT REFERENCES organizations(id),
  type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  correlation_id TEXT,
  causation_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);
CREATE INDEX idx_domain_events_org ON domain_events(org_id, seq);

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  key TEXT NOT NULL,
  scope TEXT NOT NULL,
  response_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, scope, key)
);

CREATE TABLE feature_flags (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, name)
);
