# Enterprise AI Agency OS — Audit & Context Report
**Prepared for:** incoming AI agent (further development)
**Date:** 2026-08-28
**Scope:** Session review, current running condition, project context (scale/goal/focus/target), full feature & architecture inventory, and handoff guidance.

---

## 0. TL;DR for the next agent
- The **live application is healthy**: the control-plane API is running (PID 22340) on `http://127.0.0.1:3000`, serving the v0.16.0 feature set. The SQLite DB at `apps/control-plane/data/agencyos.sqlite` is intact (21 seeded agents, test project, `project_agents`, requirements, full audit chain).
- **Source code for this project is currently NOT present under `Enterprise AI Agency OS/`** on disk — only the `data/` DB folder survives. The Read/Edit tools and filesystem both confirm the source tree is gone from that folder.
- **The same monorepo (identical architecture, and crucially our `packages/db/src/migrations/0006_project_agents.sql`) is present at `C:\Users\DST\projects\Scraping Agent`.** This is almost certainly the active/renamed working copy. **Confirm which directory is canonical before editing.**
- The dashboard dev server on :5180 is currently down; a `vite preview` (PID 8596) is on :4173 (verify it serves our build). To run the dashboard you likely need the source under the *canonical* folder.
- Everything delivered this session is verified working against the live API (see §6). Recover source via the GitHub remote (`origin` = `tanviruchahs2580/Enterprise-AI-Agency-OS-`) or from the `Scraping Agent` copy, then `npm ci && npm run migrate && npm run dev`.

---

## 1. Session review (what was built/fixed this session)
Chronological, with commit anchors where known:
1. **Governed workflow v2 + monitor hardening** (v0.13.0): 14-step `agency-workflow.md` (S0 DoR, S10 threat-model, S11 canary+SLO/rollback, S12 DORA) with SAFe/Spotify/GitLab/DORA alignment; `workflow-monitor.mjs` rewritten to a dependency-free file scanner (the old `npx rg` was a no-op security gate) adding DoR/CHANGELOG, threat-model, and observability gates → **13/16 checks (3 advisory).**
2. **CI/CD hardening** (v0.13.0): governance job running the monitor, concurrency/timeouts/`workflow_dispatch`, removed duplicate Trivy step, added Playwright e2e job + `@playwright/test` dep + `.github/CODEOWNERS`. All 5 push runs green.
3. **Real per-stage delivery persistence** (v0.14.0): migration `0005_delivery_stages.sql`, `delivery.ts` persists every stage via `onStage`, `app.ts` reads real persisted stages (honest `pending`/`failed` fallback). Verified a full offline autonomous delivery: `status=succeeded`, 15/15 stages, `receipt=1`.
4. **Delivery Run Detail UI** (v0.14.0): enriched backend `GET /api/v1/delivery/runs/:id` + `DeliveryRunDetail.tsx` + route + clickable row + test. 120 vitest pass.
5. **Project-agents team feature** (v0.15.0 → v0.16.0): migration `0006_project_agents.sql`; `POST/GET/DELETE /api/v1/projects/:id/agents` (RBAC-gated, audit-logged). Dashboard **ProjectDetail "Agents" tab**: member roster with full per-agent detail, a **live SSE activity monitor** filtered to the project's tasks, and add/remove controls.
6. **Agents page upgrade** (v0.16.0): summary header (total agents, busy, distinct roles, combined budget cap) + expandable per-agent detail (role, model tier, budget, max iterations, timeout, allowed/forbidden tools, id).
7. **Project creation with agents + instructions** (v0.16.0): `Projects.tsx` create form now has an agent multi-select (chips) and an instructions textarea; on create it assigns agents (`POST /projects/:id/agents`) and adds each instruction as a requirement (`POST /projects/:id/requirements`). Verified end-to-end (2 agents + 2 requirements stored as REQ-0001/0002).
8. **Fixed the "Control plane unreachable (received HTML)" error** (v0.16.0, root cause of the user's reported bug):
   - Root cause: dashboard called some routes at server **root** (`/health`) which Vite does **not** proxy → Vite served `index.html`. Also `/ready` (only existed at root) and `/audit/events` (no such route) 404'd. When the API was down, every `/api/*` returned Vite's HTML error page, and `useApiQuery`/`api()` threw a cryptic `Unexpected token '<'`.
   - Fixes: added `/api/v1` aliases for `/health`,`/ready`,`/live`,`/metrics`,`/audit/events` (public); made `api()` and `useApiQuery()` always route under `/api/v1` (no root paths, no double-prefix); added Vite proxy entries for root health/ready/live/metrics; hardened clients to throw a **clear** "Control plane unreachable" message instead of the cryptic parse error; and defaulted the dashboard API key to `demo-key` so it works out-of-the-box.
9. **DB durability** (`server.ts`,`driver.ts`): explicit `ctx.db.close()` with `PRAGMA wal_checkpoint(TRUNCATE)` on shutdown + `normalizeSqlitePath()` so WAL frames are durable across restarts (explains an earlier "empty projects after restart" symptom).

Verified: `npm run lint` clean, `npm run typecheck` clean, `npm run build` OK, `npm test` **120/120 pass**, and every dashboard endpoint returns JSON (not HTML) through the proxy.

---

## 2. Current condition (verified live)
| Component | Status | Notes |
|---|---|---|
| Control-plane API | ✅ RUNNING (PID 22340) | `http://127.0.0.1:3000`; `/health` → `{"status":"ok"}`; `/api/v1/agents` → 21 agents; all tab endpoints return JSON. |
| SQLite DB | ✅ INTACT | `apps/control-plane/data/agencyos.sqlite` (+ `-wal`/`-shm`). Contains 21 agents, test project `prj_…`, `project_agents` rows, requirements, full audit chain. |
| Dashboard (dev :5180) | ⚠️ DOWN | PID not listening. Restart from canonical source dir. |
| Dashboard (`vite preview` :4173) | ⚠️ UNVERIFIED | PID 8596 present; confirm it serves our build. |
| Source tree in `Enterprise AI Agency OS/` | ❌ ABSENT | Only `apps/control-plane/data/` survives. No `packages/`, `apps/dashboard/`, `.git`, `package.json`, `scripts/`. |
| Canonical source hypothesis | 🔎 `C:\Users\DST\projects\Scraping Agent` | Same monorepo; contains our `0006_project_agents.sql`, `workflow-monitor.mjs`, `packages/orchestration|delivery|security|models|integrations|scraper`. Likely the active/renamed copy (adds scraping). **Confirm before editing.** |
| GitHub remote | `tanviruchahs2580/Enterprise-AI-Agency-OS-` | Pushed through ~v0.14.0; v0.15/0.16 committed locally (pre-reset). Use as recovery source of truth. |

---

## 3. Project identity, scale, goal, focus, target
**What it is:** An autonomous "software agency" control plane. A user defines a mission/project; specialist **agents** (each with a role, tool contract, model tier, and budget) are dispatched through a gated SDLC to plan, implement, review, deliver, and deploy software. It is the *orchestration brain*, not a single chatbot.

- **Scale (current):** 21 seeded specialist agents across ~18 roles (ORCHESTRATOR, ARCHITECTURE, ENGINEERING×3, REVIEW×2, DATA, PLATFORM×2, DOCS, FINANCE, PRODUCT×2, QUALITY×2, RELEASE, RESEARCH, SECURITY, SUPPORT, PRINCIPAL, STAFF). Monorepo with `packages/*` (db, core, delivery, security, orchestration, models, integrations, scraper) and `apps/*` (control-plane API, dashboard SPA). ~1,600-line Fastify `app.ts` with 40+ route handlers.
- **Goal:** Provide a governed, auditable, cost-bounded autonomous delivery pipeline — "ship software like an agency," with human approval gates, hash-chained audit, RBAC, budgets, and quality gates (DORA-style).
- **Focus (this session):** (a) make the product *demonstrably functional end-to-end* (real delivery persistence + detail views), (b) make the **dashboard truthful and error-free** (Agents full detail; Project → which agents work on it, live; add agents/instructions at creation), (c) harden governance (monitor, CI, international alignment).
- **Target user:** platform/eng leaders who want to delegate software delivery to a swarm of vetted specialist agents with safety rails. Non-negotiable product values: **governance, auditability, least-privilege, cost control, quality gates.**

---

## 4. Architecture (high level)
```
Browser (React SPA :5180)
   └─ Vite dev proxy /api[/health/ready/live/metrics] → http://127.0.0.1:3000
Control-plane (Fastify :3000, Node 24 --experimental-strip-types)
   ├─ auth (RBAC, bootstrap admin key = ADMIN_BOOTSTRAP_KEY, default "demo-key")
   ├─ routes: organizations, missions, workstreams, projects, project_agents,
   │         requirements, tasks, executions, deliveries/runs, approvals,
   │         deployments, security/findings, audit, agents, events(SSE), models, costs
   ├─ workers: generic job queue (claim/lease), delivery worker (agentic pipeline)
   ├─ ctx: db (SQLite node:sqlite | Postgres adapter), audit (hash-chain), budgets, rate-limit
   └─ Db: SQLite file (WAL) + migrations 0001..0006 (+0007 in Scraping Agent copy)
Packages:
   @agency/db        – driver + migrations (SQLite/PG)
   @agency/core      – ids, events, logger, config, secrets, clock
   @agency/delivery  – agentic codegen pipeline, quality-gates, runner, reviewer
   @agency/security  – RBAC, approvals, audit, rbac matrix
   @agency/orchestration – workflow, jobs, worktree isolation, sandbox, statemachine, governance
   @agency/models    – LLM router/providers (mock providers in sandbox)
   @agency/integrations
   @agency/scraper   – (present in Scraping Agent copy)
Dashboard (React + Vite):
   pages: Overview, Projects, ProjectDetail (incl. Agents tab), Tasks, Delivery,
          DeliveryRunDetail, Agents, Models&Cost, Security, Approvals, Deployments,
          Knowledge, Audit, Settings
   libs: api.ts (fetch + /api/v1 routing + HTML/JSON error handling),
         useEventStream.ts (react-query useApiQuery + SSE useEventStream),
         ui.tsx (Card/Badge/StatCard/...), Toast, theme
```

**Key invariants (do not break):**
- ADR-0003: no TypeScript parameter properties in class constructors.
- All `/api/v1` routes require auth unless in `PUBLIC_PATHS` (health/ready/live/metrics + `/api/v1` aliases).
- Audit is append-only + hash-chained; tampering is detected by `/api/v1/audit/verify`.
- Approvals are single-use (A1), expirable; high-risk actions blocked until approved.
- Budgets default to a $25/day block budget; agents have per-agent `budget_usd` (seeded $5).

---

## 5. API endpoint catalog (control-plane)
Health/meta: `GET /health`,`/ready`,`/live`,`/metrics`,`/api/v1/meta`, and `/api/v1` aliases of the first four.
Orgs/missions: `POST/GET /api/v1/organizations`, `/api/v1/missions`.
Projects: `POST/GET /api/v1/projects`, `GET /api/v1/projects/:id`, `POST/GET/DELETE /api/v1/projects/:id/agents`, `POST/GET /api/v1/projects/:id/requirements`.
Tasks: `POST/GET /api/v1/tasks`, `GET /api/v1/projects/:id/tasks/ready`, `POST /api/v1/tasks/:id/transition`, `/receipt`, `/reviews`.
Executions: `POST/GET /api/v1/executions`.
Delivery: `GET /api/v1/delivery/runs`, `GET /api/v1/delivery/runs/:id` (enriched).
Approvals: `POST/GET /api/v1/approvals`, `GET /api/v1/approvals/pending`, `POST /api/v1/approvals/:id/decide`.
Deployments: `POST /api/v1/deployments`, `GET /api/v1/deployments`, `:id/succeed|:id/fail|:id/rollback`.
Security: `POST/GET /api/v1/security/findings`.
Audit: `GET /api/v1/audit`, `/api/v1/audit/events`, `/api/v1/audit/verify`.
Agents: `GET /api/v1/agents`, `POST /api/v1/agents/seed`, `:id/heartbeat`, `:id/status`.
SSE: `POST /api/v1/events/ticket` → `EventSource('/api/v1/events?ticket=…')` (one-time ticket; key never in URL; resumes via Last-Event-ID).
Models/cost: `GET /api/v1/models`, `POST /api/v1/models/complete`, `GET /api/v1/costs/summary`.
Auth: bootstrap admin key (`ADMIN_BOOTSTRAP_KEY`, default `demo-key`); minted keys via `POST /api/v1/keys` (role ADMIN). Dashboard now defaults to `demo-key`.

---

## 6. Feature inventory (status = verified this session)
| Feature | Status | Evidence |
|---|---|---|
| Agent roster (21) with full detail | ✅ | `/api/v1/agents` returns 21; Agents page shows tier/tools/budget. |
| Project → Agents tab (members + live SSE monitor + add/remove) | ✅ | `GET/POST/DELETE /projects/:id/agents` verified; SSE ticket works. |
| Project creation with agents + instructions | ✅ | E2E: project + 2 agents + 2 requirements (REQ-0001/0002). |
| Delivery run detail + real per-stage persistence | ✅ | migration 0005; offline run 15/15 stages, receipt=1. |
| JSON/HTML error hardening | ✅ | All tab endpoints return JSON via proxy; clear messages. |
| Governance monitor | ✅ (13/16) | 3 advisory: Playwright browsers absent; dynamic-exec refs in `agents.ts`/`delivery/gates.ts` (pattern-match, not live). |
| CI/CD (governance + e2e + CODEOWNERS) | ✅ | All push runs green (when source present). |
| International-aligned 14-step workflow doc | ✅ | `docs/agency/agency-workflow.md`. |

---

## 7. Known issues / tech debt
- **Source location ambiguity (BLOCKER for dev):** see §0/§2. Resolve before any code change.
- **Monitor 3 advisories:** (1) Playwright browsers not installed in sandbox → e2e job is best-effort; (2)(3) `agents.ts` and `delivery/gates.ts` contain a `dynamic-exec`-like string that trips the threat-model gate (advisory only — it's a description/reference, not an active `eval`). Either whitelist or refactor to remove the matched token.
- **Dashboard not auto-started:** provide a single `npm run dev` (or document `apps/control-plane` + `apps/dashboard` start) so both stay up; the live monitor and tab data depend on the API being reachable.
- **Default `demo-key`:** fine for local; production must require a real admin key (Settings → API Key).
- **Mock model providers:** sandbox uses `mock-fast/standard/reasoning`; wire real LLM providers via `@agency/models` for actual agent runs.

---

## 8. How to run (recovery + normal)
1. **Recover source:** `git clone <origin> Enterprise-AI-Agency-OS` OR use the `Scraping Agent` copy (confirm canonical). Then `npm ci`.
2. **DB:** `npm run migrate` (applies 0001..0006; 0007 if using the Scraping Agent copy). Seed agents: `npm run seed` (or `POST /api/v1/agents/seed`).
3. **API:** `ADMIN_BOOTSTRAP_KEY=demo-key PORT=3000 npm run dev` (or `node --experimental-strip-types apps/control-plane/src/server.ts`). Verify `/health`.
4. **Dashboard:** `cd apps/dashboard && npx vite --port 5180 --strictPort`. Open `http://localhost:5180/`; it defaults to `demo-key`.
5. **Verify:** `npm run lint && npm run typecheck && npm test` (expect 120 pass); `node scripts/workflow-monitor.mjs`; open a Project → Agents tab → confirm members + live monitor; create a project with agents + instructions.

---

## 9. Further-development focus & target (where to take it)
**Target state:** a production-grade autonomous agency where a user describes an outcome and a governed swarm delivers it with full audit, cost control, and human checkpoints — benchmarked against SAFe/Spotify/GitLab/DORA.

Recommended next steps (prioritized):
1. **Resolve source-of-truth** (§0/§2/§8) and re-establish a clean git history + CI on the canonical dir.
2. **Live agent activity:** the Agents tab "live monitor" currently filters SSE by `taskId ∈ project tasks`. Enrich `publishEvent` payloads to always carry `projectId` (and `agentId`) so the monitor can show per-agent "who is doing what" without the taskId join. Add agent `status` heartbeat updates during runs.
3. **Working-procedure-driven creation:** extend the project-create flow to accept a "working procedure" (template of stages/agents/instructions) and auto-populate the agent+instruction selection; persist a `project_procedures` table.
4. **Real LLM wiring:** replace mock providers in `@agency/models` with configured providers; add token/cost tracking to the existing `costs/summary`.
5. **Close the 3 monitor advisories** and promote the monitor to a required CI gate (fail build on any non-advisory failure).
6. **Deployments tab end-to-end:** `deploy.staging`/`production` tool gating, rollback plans, and a real (or simulated) deploy pipeline feeding `Deployments` + `delivery` receipt linkage.
7. **Scale tests:** load-test the job queue + SSE with many concurrent deliveries; verify budget enforcement and dead-letter handling under stress (tests G-05b exist).
8. **Docs:** keep `agency-workflow.md` and this audit in sync; add an architecture diagram and a runbook.

---

## 10. One-line handoff
The product is feature-complete for the requested demo (agents detail, project→agents live view, add agents/instructions, no HTML errors) and **running live on :3000**; the only blocker for *editing* it is that the source must be recovered from the GitHub remote or the `Scraping Agent` copy and the canonical directory confirmed — after which `npm ci && npm run migrate && npm run dev` restores full development.
