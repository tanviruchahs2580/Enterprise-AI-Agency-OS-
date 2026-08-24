# Changelog

All notable changes. Format: Keep a Changelog; versioning: SemVer.

## [0.1.0] — 2026-08-24

### Added
- **Core kernel** (`packages/core`): zod-validated config with production fail-fast,
  structured logger w/ secret redaction, typed error taxonomy, domain event bus,
  UUIDv7 ids, canonical-JSON hashing.
- **Persistence** (`packages/db`): `node:sqlite` driver + driver abstraction
  (PostgreSQL path documented), checksum-verified migration runner, schema v1
  (35 tables incl. audit chain, budgets, jobs, workflow runs, knowledge).
- **Security kernel** (`packages/security`): full RBAC matrix (11 roles),
  hash-chained append-only audit log with online verification, human approval
  gates for high-risk actions.
- **Model routing** (`packages/models`): tier/capability router, per-model circuit
  breakers, retry/backoff/timeout, never-silent fallbacks recorded to DB,
  budget guard integration, mock provider + OpenAI-compatible provider.
- **Orchestration** (`packages/orchestration`): 21-agent enterprise roster as tool
  contracts, task dependency graph with cycle detection and ready-queue,
  guarded task state machine, verifiable quality receipts, process/docker sandbox
  providers with destructive-command screening, persistent job queue
  (retry/backoff/dead-letter/requeue), resumable YAML-defined workflow engine.
- **Control plane** (`apps/control-plane`): Fastify REST API `/api/v1` — auth
  (hashed API keys), rate limiting, structured errors, SSE event stream,
  health/live/ready, projects, requirements, tasks, agents, executions+worker,
  models/costs/budgets, approvals, deployments (+rollback), security findings,
  knowledge search, audit + verify.
- **Dashboard** (`apps/dashboard`): enterprise console — live overview with SSE,
  projects, task kanban, agent fleet, model spend, security ops, approval gates,
  deployment rollback, knowledge search, hash-chain audit viewer. Real data only.
- **MCP server** (`apps/mcp-server`): stdio MCP exposing safe agency tools
  (status, projects, context, tasks, ready queue, knowledge search, approvals,
  audit verify) with contract tests.
- **Integrations** (`packages/integrations`): GitHub REST adapter (flagged),
  HMAC-signed outbound webhook emitter with bounded retries.
- **Infra**: Dockerfiles (non-root), compose profiles (core/postgres/
  observability), `.env.example`, bootstrap scripts (ps1/sh), migrate/seed/
  self-test/verify-production/SBOM scripts.
- **CI/CD**: GitHub Actions ci (ubuntu+windows matrix), security (gitleaks +
  npm audit + SBOM artifact), release (tag → checks → GH Release w/ SBOM);
  Dependabot; CODEOWNERS.
- **Docs**: QUICKSTART, ARCHITECTURE (C4/mermaid), SECURITY (STRIDE threat
  model), CONTRIBUTING, DEVELOPMENT, DEPLOYMENT, OPERATIONS (+backup/restore
  runbooks), DISASTER-RECOVERY (RPO/RTO), API reference, MODEL-ROUTING, AGENTS,
  SKILLS, WORKFLOWS, TROUBLESHOOTING, ROADMAP, ADRs, audit/risk docs.

### Security
- Secrets never stored in code/db (env-backed secret refs, hashed API keys).
- Destructive command screening at the sandbox layer (defense in depth).
- Production profile refuses unsafe configuration (sqlite/wildcard CORS/
  missing admin key/process sandbox).
