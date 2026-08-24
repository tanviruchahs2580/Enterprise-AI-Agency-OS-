# API (v1)

Base URL: `/api/v1` · Auth: `authorization: Bearer <api key>` ·
Errors: `{ "error": { code, message, requestId, retryable, details? } }`

## Meta & health

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | /health | public | liveness |
| GET | /ready | public | readiness + queue DLQ count |
| GET | /live | public | process alive |
| GET | /api/v1/meta | public | version + feature flags |

## Projects & requirements

| Method | Path | Permission |
|---|---|---|
| POST | /projects {name, description?, slug?, repoUrl?} | project:create |
| GET | /projects | project:read |
| GET | /projects/:id | project:read |
| POST | /projects/:id/requirements {title, acceptanceCriteria?} | task:create |
| GET | /projects/:id/requirements | project:read |

## Tasks

| Method | Path | Permission |
|---|---|---|
| POST | /tasks {projectId, title, dependsOn?[], priority?} | task:create |
| GET | /tasks?projectId&status?&cursor?&limit? | project:read |
| GET | /projects/:id/tasks/ready | project:read |
| POST | /tasks/:id/transition {to} | task:update |
| POST | /tasks/:id/receipt {tests, security, review, coverageLine?…} | task:update |

Task states: draft→ready→planned→in_progress→review→qa→security→approval→
deploying→deployed→monitoring→completed (+ blocked/failed/rollback_required/cancelled).
Illegal transitions → `409 CONFLICT`. Dependencies are cycle-checked at creation.

## Agents & executions

| Method | Path | Permission |
|---|---|---|
| GET | /agents | agent:read |
| POST | /agents/seed | agent:manage |
| POST | /agents/:id/heartbeat | execution:control |
| POST | /agents/:id/status {status} | agent:manage |
| POST | /executions {taskId, agentId} → 202 | task:dispatch |
| GET | /executions?taskId? | execution:read |
| GET | /jobs/stats | settings:read |

## Models, cost, budgets

| Method | Path | Permission |
|---|---|---|
| GET | /models | model:read |
| POST | /models/complete {prompt, tier?} | model:read |
| GET | /costs/summary | model:read |
| POST | /budgets {scopeType, scopeId?, limitUsd, action?} | budget:manage |

## Approvals

| Method | Path | Permission |
|---|---|---|
| POST | /approvals {action, resourceType, resourceId, reason, riskLevel} | approval:request |
| GET | /approvals/pending | settings:read |
| POST | /approvals/:id/decide {decision: approve\|reject} | approval:decide |

## Deployments

| Method | Path | Permission |
|---|---|---|
| POST | /deployments {projectId, environment, version, commitSha, strategy?} | deployment:create (+approval for production) |
| GET | /deployments | deployment:read |
| POST | /deployments/:id/succeed \| /fail | deployment:create |
| POST | /deployments/:id/rollback → 202 | deployment:rollback |

## Security findings

| Method | Path | Permission |
|---|---|---|
| GET | /security/findings?severity?&status? | security:read |
| POST | /security/findings {severity, title, tool?…} | security:manage |

## Knowledge

| Method | Path | Permission |
|---|---|---|
| POST | /knowledge {kind, title, content, tags?, confidence?} | knowledge:write |
| GET | /knowledge/search?q= | knowledge:read |

## Audit

| Method | Path | Permission |
|---|---|---|
| GET | /audit?limit?&beforeSeq? | audit:read |
| GET | /audit/verify | audit:verify |

## Events (SSE)

`GET /api/v1/events` — `text/event-stream`; events named `domain`; auth via the
standard header or `?auth=<key>` for EventSource clients. Server-sent keepalives
every 15s.

## Pagination

List endpoints return `{ items, nextCursor }`. Cursor = ISO timestamp of the last
item; pass as `?cursor=`. Maximum page size 200.
