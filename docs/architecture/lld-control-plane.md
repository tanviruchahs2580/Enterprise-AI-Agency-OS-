# LLD v1.0 — Control Plane Module

| | |
|---|---|
| **Document** | `docs/architecture/lld-control-plane.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | Backend Eng + Architect |
| **HLD** | `docs/architecture/hld.md` |

## 1. Module boundary

- **Path:** `apps/control-plane/src/*` (`app.ts`, `budget.ts`, `metrics.ts`, `tracing.ts`, `version.ts`, `context.ts`)
- **Imports allowed:** `packages/{db,core,models,orchestration,skills}` — never reverse.
- **Enforcement (Phase 3):** ESLint `import/no-restricted-paths`.

## 2. Responsibilities

- Fastify route assembly (`app.ts:2600+` — 60+ routes), RBAC (`auth.ts`), job queue (`src/jobs.ts`), workflow engine wiring (`context.ts:127`).
- **Version single source:** `src/version.ts` → `meta.version` + `metrics agencyos_build_info` + tracing (docs-check invariant).

## 3. Key components

| Component | File:line | Contract |
|---|---|---|
| **Agent seeding** | `app.ts:876` `POST /agents/seed` + `registry.ts:18` | `AgentRegistry.seedRoster(orgId)` UPSERT 24 contracts |
| **Skill execution** | `app.ts:1303` `POST /skills/runtime/execute` | `SkillRuntime` with `verify: evaluateRubric + evidence gate` → `422 evidence_required` |
| **Routing** | `app.ts:897` `POST /routing/decide` | `CapabilityRouter.route` scored, persisted `routing_decisions` |
| **Handoffs** | `app.ts:1225` `POST /handoffs` | `validateHandoff` + `verificationPolicyFor` |
| **Evidence** | `app.ts:1175` `POST /evidence` | `hashContent` + `verifyRecord` |
| **Workflows** | `app.ts:2236` `GET /workflows`, `app.ts:2604` `POST /workflows/:name/start` | `WorkflowEngine` + `WorkflowTemplateRegistry` |

## 4. Error envelope (OAS)

All errors: `{error:{code,message,requestId,retryable}}` (`AppError`, `app.ts:250`).

## 5. Testing

- `apps/control-plane/test/workforce.test.ts` (8 E2E), `test/specialists.test.ts`, `test/*.test.ts` — included in 235.
