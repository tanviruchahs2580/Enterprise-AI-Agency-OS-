# BUILD AUDIT — Enterprise AI Agency OS

Date: 2026-08-24
Builder: OpenCode + Ox Alpha (Principal AI Software Architect role)

## 1. Environment Audit

| Component | Status | Notes |
|---|---|---|
| OS | Windows (win32) | Primary dev machine is Windows; all scripts must have PS + sh variants |
| Node.js | v24.19.0 | Native TypeScript type-stripping available (`node --test`, `node script.ts`) |
| npm | 11.17.0 | Workspaces supported |
| pnpm | NOT installed | Decision: use npm workspaces (ADR-0002) |
| Python | 3.12.10 | Available but not required by chosen stack |
| Docker | **NOT installed** | Container runtime unavailable on this machine (ADR-0004, RISK-001) |
| Git | 2.55.0.windows.5 | OK |
| GitHub CLI | gh 2.98.0 | Auth status verified during finalization stage |

## 2. Repository Audit

**CRITICAL FINDING:** A `.git` directory existed in `C:\Users\DST` (the user HOME),
not in the project directory. Running any git command inside the project operated on
the HOME repository with remote
`https://github.com/tanviruchahs2580/Enterprise-AI-Agency-OS-` configured.

Resolution:
- Initialized a fresh, dedicated git repository inside the project directory.
- Left the accidental HOME-level `.git` untouched (destructive cleanup of a user's
  home directory is out of scope and dangerous). Documented for the principal.
- Configured the same GitHub remote in the project repository.

The remote repository name contains a trailing dash: `Enterprise-AI-Agency-OS-`.
This is intentional per the principal's instruction ("repository create kora ache")
and is kept as-is.

## 3. Blueprint Audit

Source documents:
1. `enterprise-ai-agency-blueprint.md` (architectural source of truth)
2. Master Build Prompt (execution contract)

### 3.1 Blueprint claims that could NOT be verified / are treated as references only

Per the non-negotiable rule "do not blindly trust blueprint commands", the following
blueprint-referenced repositories/commands were treated as architectural inspiration,
NOT as installable dependencies:

| Reference | Disposition |
|---|---|
| `garrytan/gstack` (128k stars claim, browse daemon) | Not integrated. Browser automation deferred behind `BrowserAutomationProvider` interface + feature flag. No verified install path on Windows without Docker. |
| `obra/superpowers` | Methodology absorbed as workflow definitions (brainstorm→plan→execute→verify), not installed as plugin (Claude Code-specific). |
| `OpenHands/OpenHands`, `agent-canvas` | Sandbox concept reimplemented via our own `SandboxProvider` interface (process provider now, docker provider ready). No dependency on OpenHands runtime. |
| `mattpocock/skills` | Disciplines encoded as agent system prompts + skill metadata. Not installed via npx (Claude/Codex marketplace specific). |
| `the-agency-ai/the-agency` (ISCP) | ISCP concept replaced by persistent domain event log + task queue in PostgreSQL/SQLite. Hash-chained QGR receipts implemented in `packages/security`. |
| `agency-swarm` (OpenAI Assistants API) | Not integrated (vendor lock-in risk). Model abstraction covers the need. |
| `FunnyWolf/agentic-soc-platform` | SOC concepts (alert→case→investigation→approval) implemented as first-class security module tables + API. No external platform dependency. |
| `NousResearch/hermes-agent` | Voice/A2A/webhooks deferred behind optional integration flags. Outbound signed webhook emitter implemented in core. |
| `sdlc-skills` (48 skills) | Skill registry schema implemented; lifecycle skill categories seeded as data. |
| `spec-kitty`, `mission-control` | Kanban + spend governance implemented natively in dashboard/API. |
| LangGraph | Not used — deterministic typed state machine engine implemented in `packages/orchestration/workflow`. Simpler, auditable, no heavy dependency. |

### 3.2 Missing points found in the blueprint/master prompt (added to this build)

| # | Gap identified | Resolution in this repo |
|---|---|---|
| 1 | LICENSE not specified | Apache-2.0 (ADR-0001) |
| 2 | No optimistic locking / concurrency control spec | `version` columns + conditional UPDATE on mutable aggregates |
| 3 | GDPR right-to-erasure / soft-delete undefined | `deleted_at` columns + erasure procedure in OPERATIONS.md |
| 4 | Outbound webhook retry/DLQ missing | Signed outbound webhook emitter with retries + dead-letter table |
| 5 | API pagination standard missing | Cursor-based pagination standard (`?cursor=&limit=`, opaque cursors) |
| 6 | Accessibility standard missing | WCAG 2.1 AA target documented + keyboard-navigable dashboard |
| 7 | Dependency update automation missing | Dependabot config (ecosystem pins, weekly) |
| 8 | CODEOWNERS missing | Added |
| 9 | Clock-skew handling for audit hash chain | Monotonic per-org sequence + server-authoritative timestamps; chain verify tolerates reordering only via seq, never wall clock |
| 10 | Runtime pinning missing | `engines.node >=24`, `.nvmrc`, pinned CI node version |
| 11 | Windows-first dev experience absent | `bootstrap.ps1`, process sandbox provider, no Docker required for dev/test |
| 12 | Queue DLQ alerting unspecified | Dead-letter jobs surfaced via `/health` + dashboard Jobs panel |
| 13 | Budget enforcement order across scopes undefined | Defined: request → task → mission → project → org → daily → monthly (first violation wins) |
| 14 | Backup encryption unspecified | Backup scripts support age/gpg encryption hook; documented runbook |
| 15 | Commit signing policy unspecified | Documented recommendation (sigstore/gitsign optional); CI verifies provenance via SBOM+SHA |

## 4. Tooling Decisions (summary)

- Runtime TS execution via Node native strip-types (ADR-0003) — zero build step for services.
- Tests: `node:test` + `node:assert` — deterministic, offline, no paid APIs.
- Lint: eslint 9 flat config + typescript-eslint.
- DB: SQLite (via `node:sqlite`) for local/dev/test; driver interface keeps PostgreSQL
  production-ready path (compose profile provided); migrations are plain versioned SQL.
- API: Fastify v5 + zod validation.
- Dashboard: React + Vite SPA consuming `/api/v1` only — no fake data anywhere.

## 5. Verification Constraints (honesty ledger)

| Capability | Verifiable here? | Note |
|---|---|---|
| Unit/integration tests, lint, typecheck | YES | Fully executed |
| Server boot, health checks, E2E API tests | YES | Executed locally |
| Dashboard build + serve | YES | Vite build executed |
| Container builds | NO (BLOCKED) | Docker absent on this machine; compose files provided & syntax-reviewed |
| Kubernetes | NO | Architecture-ready only (documented) |
| Real LLM providers | PARTIAL | Mock provider fully tested; real provider requires API key supplied at runtime |
| GitHub push/Actions | YES (if auth allows) | Verified at finalization; failures reported honestly |
