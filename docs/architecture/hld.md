# HLD v1.0 — High-Level Design (C4 Level 1–2)

| | |
|---|---|
| **Document** | `docs/architecture/hld.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | Architect (architect) — **Accountable: Human (G1)** |
| **Status** | Draft for G1 |
| **ADR** | `docs/adr/ADR-0001.md` |

---

## 1. System context (C4 L1)

```
[Client Browser / CLI] --> [Agency OS Control Plane :3000] --> [SQLite/Postgres]
         |                              |-> [Model Router (mock/real)] -> [LLM Providers]
         |                              |-> [Sandbox (process)] -> [Worktrees]
         |                              `-> [Job Queue (polling)]
[Dashboard :5173] ---------> [Control Plane]
[GitHub] <---------------> [Control Plane (webhooks)]  (optional)
```

- **Users:** Human founder (OWNER), agents (24 contracts), external LLMs (via router).
- **External:** GitHub (PRs), OTel collector (optional), LLM providers (OpenAI-compatible).
- **Trust boundaries:** Public `POST /api/v1/*` (bearer RBAC) vs internal `workflow_runs.state_json` (encrypted at rest via `OrgKeyEncryption`).

## 2. Containers (C4 L2)

| Container | Tech | Purpose | Scale | Owner |
|---|---|---|---|---|
| **control-plane** | Node 24 + Fastify + TypeScript | API, governance, agent orchestration, audit | 1 replica, stateless | Backend Eng + Architect |
| **dashboard** | Vite + React 18, 691 modules | Ops UI (projects, tasks, workflows) | static CDN | Frontend Eng |
| **db** | SQLite (local) / Postgres (prod) via `@agency/db` | Source of truth — `agents`, `tasks`, `evidence_records`, `routing_decisions`, `workflow_runs` | single primary | DBA |
| **model-router** | `@agency/models` (mock + real gateway) | Tiered routing (FAST/STANDARD/REASONING), budget downgrade `budget_downgrade_fast` | stateless | Staff Eng |
| **sandbox** | `ProcessSandbox` (process) / future container | Per-task worktrees, `prepareWorktree` + `diff` + `cleanup` | per task | SRE |
| **scraper** (optional) | Deterministic scraper worker | Seeded crawls, robots.txt, PII redact | per job | Data Eng |

Module boundaries enforced by **tooling**: `packages/orchestration` cannot import `apps/control-plane` (ESLint `import/no-restricted-paths` in Phase 3).

## 3. Key design decisions (see ADRs)

- **Deterministic orchestration before LLM** — `MissionCompiler`, `CapabilityRouter`, `SkillRuntime` are pure, testable; LLM is a slot (`runStep` harness). Evidence: `packages/orchestration/test/workforce.test.ts`.
- **Fan-out parallelism** — `workflow.ts:16 fanOut` + `Promise.all` converging; 13-stage `enterprise-feature` with 17 branches (wall time ∝ critical path).
- **Handoff contracts** — `validateHandoff` + `verificationPolicyFor` (0.9/0.6 thresholds), persisted to `agent_handoffs`.
- **Evidence registry** — `hashContent` + `verifyRecord`; claims must be backed or `412 evidence_required`.
- **12-Factor config + encrypted state** — `config.ts` + `OrgKeyEncryption` codec for `workflow_runs`.

## 4. Non-functional drivers (→ `nfr-register.md`)

- p95 500ms on dashboard queries, 99.9% avail, RTO 1h / RPO 5min, scale 10k rps (dashboard), 100 concurrent agents.

## 5. OpenAPI contract

- `openapi.yaml` (OAS 3.1) — **API-first**: contract before implementation (Hard Rule, §5 Phase 2). Error envelope `{error:{code,message,requestId,retryable}}`.

## 6. Change log

- v1.0 — initial HLD (C4 L1–L2)
