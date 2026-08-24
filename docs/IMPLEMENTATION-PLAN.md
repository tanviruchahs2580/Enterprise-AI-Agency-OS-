# IMPLEMENTATION PLAN

Order follows the master build prompt §102. Each stage ends with: tests green →
typecheck → lint → conventional commit → PROGRESS.md update.

| Stage | Deliverable | Key modules |
|---|---|---|
| 0 | Repo foundation | git init (project dir), root configs, audit docs |
| 1 | Core kernel | config(zod), logger, errors, events, ids, result, clock |
| 2 | Persistence | driver interface, sqlite driver, migration runner, schema v1 (35+ tables), repos |
| 3 | Security kernel | RBAC matrix, permission checks, approvals service, hash-chained audit |
| 4 | Model layer | provider interface, registry, router(policy/budget/health), breaker, retry/backoff, cost ledger, mock+openai-compatible providers |
| 5 | Orchestration | agent registry+roster seeds, task graph (cycle detect), workflow engine (YAML), sandbox interface(process/docker), handoff contracts, job queue(retry/backoff/DLQ) |
| 6 | Control plane API | Fastify /api/v1: auth, projects, missions, workstreams, tasks, agents, executions, models/routing, approvals, security findings, deployments(+rollback), knowledge search, audit(+verify), events SSE, health/ready/live, rate limiting, structured errors |
| 7 | Dashboard | React SPA: overview/projects/tasks(kanban)/agents/models/cost/security/approvals/deployments/knowledge/audit/settings; SSE live updates; loading/empty/error states; WCAG-minded |
| 8 | Integrations | MCP stdio server (safe tools only), GitHub adapter (REST, feature-flagged), signed outbound webhooks |
| 9 | Infra | Dockerfiles, docker-compose (core + observability profiles), .env.example, bootstrap.sh/.ps1, self-test |
| 10 | CI/CD | ci.yml (lint/type/test/build, ubuntu+windows), security.yml (gitleaks), release.yml (tag→SBOM→GH Release), Dependabot, CODEOWNERS |
| 11 | Docs | Diataxis suite: QUICKSTART/ARCHITECTURE/SECURITY/OPERATIONS/TROUBLESHOOTING/API/MODEL-ROUTING/AGENTS/SKILLS/WORKFLOWS/DISASTER-RECOVERY/ROADMAP/CHANGELOG + runbooks |
| 12 | Final validation | full gate run, failure-injection tests, backup/restore test, push, tag v0.1.0, release notes |

## Acceptance mapping (master prompt §86)

Tests T1–T23 are automated in `apps/control-plane/test/e2e.test.ts` +
`packages/*/test/*` where they concern library behavior; environment-dependent ones
(GitHub push, container build) are executed/explicitly reported BLOCKED during finalization.
