# ARCHITECTURE DECISIONS

ADRs live here. Status: Accepted unless noted.

---

## ADR-0001 — License: Apache-2.0

**Context:** Blueprint integrates many ecosystems; enterprise adopters need explicit patent grant.
**Decision:** Apache-2.0 for this repository.
**Consequences:** Compatible with MIT/BSD/Apache deps; GPL deps prohibited in runtime graph (CI job checks).

---

## ADR-0002 — Package manager: npm workspaces

**Context:** pnpm not installed on build machine; corepack download adds failure modes.
**Decision:** npm workspaces with `package-lock.json` committed.
**Consequences:** Slightly larger installs; deterministic and universally available.

---

## ADR-0003 — Run TypeScript directly on Node 24 (no transpile step)

**Context:** Node ≥22.6 type-stripping runs `.ts` natively; a transpile pipeline adds
artifacts, sourcemap drift and supply-chain surface without functional benefit here.
**Decision:** Services run via `node <file>.ts` using native stripping. Imports use
explicit `.ts` extensions. `tsc --noEmit` is the correctness gate; ESLint is style gate.
**Consequences:** No `dist/` for services; containers must ship Node 24 + sources
(layer-cached). Dashboard still builds to static assets via Vite.

---

## ADR-0004 — Database: driver abstraction; SQLite default locally, PostgreSQL for production

**Context:** Docker absent on the primary machine → cannot guarantee Postgres locally;
enterprise deployments require multi-writer concurrency.
**Decision:** `DatabaseDriver` interface in `packages/db`. Implementations:
`node:sqlite` (default, zero-dependency) and PostgreSQL (via connection string +
compose profile). All schema SQL written to the portable common subset; migrations are
versioned SQL files applied by our own runner with checksum verification.
**Consequences:** Tests run offline & fast; production profile documented; no ORM lock-in.

---

## ADR-0005 — Orchestration: typed state machine engine, not LangGraph

**Context:** Blueprint mentions LangGraph as an option.
**Decision:** Deterministic, persisted, typed workflow engine (`packages/orchestration/workflow`)
with YAML definitions, gates, retries, timeouts. LLMs propose plans; the engine executes them.
**Consequences:** Auditable, replay-safe, resumable; no heavyweight dependency.

---

## ADR-0006 — Sandboxing: provider interface with process + docker implementations

**Context:** Docker unavailable locally; agents must never run unrestricted on host.
**Decision:** `SandboxProvider` interface. `ProcessSandbox` (dev/test only: cwd jail,
allow-listed commands, timeout, output caps) and `DockerSandbox` (resource limits,
network off by default) selected by config. Production defaults to Docker; boot fails fast
if production requests docker sandbox without a reachable daemon.
**Consequences:** Honest dev-mode limitation documented; production path real.

---

## ADR-0007 — AuthN/AuthZ: API keys (hashed) now, OIDC adapter seam

**Context:** Enterprise SSO requires OIDC but cannot be verified without an IdP here.
**Decision:** Bearer API keys stored as SHA-256 hashes with role binding; `IdentityProvider`
interface allows OIDC/OAuth2 implementation later without touching route code. Authorization
is enforced server-side per permission (RBAC matrix in `packages/security/rbac.ts`).
**Consequences:** Secure-by-default local experience; clean upgrade path.

---

## ADR-0008 — Events: append-only domain event log is the integration backbone

**Decision:** Every state change emits a domain event (persisted). SSE fans out to
dashboard; jobs/workflows resume from events + checkpoints. Correlation/causation IDs mandatory.
**Consequences:** Replayable history, session resilience, auditability.

---

## ADR-0009 — Model routing: capability/tier registry + breaker + cost ledger

**Decision:** Providers implement `ModelProvider`; models registered with tier,
capabilities, costs, context window. Router selects by policy (tier, privacy, budget,
health), wraps calls with retry/timeout/breaker, records every fallback in `model_requests`.
Never silently switches models — fallback reason always recorded.
**Consequences:** Ox Alpha (or any model) is configuration, not architecture.

---

## ADR-0010 — Audit log: hash-chained, append-only

**Decision:** Each audit event stores `prev_hash` and `hash = sha256(prev_hash || canonical(event))`;
per-org monotonic `seq`. Verify endpoint recomputes chain. Wall-clock skew cannot corrupt order.
**Consequences:** Tamper-evident; deletion breaks chain visibly.

---

## ADR-0011 — Monorepo layout mirrors deployment units

**Decision:** `packages/*` are internal libraries (never deployed alone);
`apps/*` are deployables (control-plane API, dashboard SPA, mcp-server).
**Consequences:** Clear ownership boundaries; CI builds apps independently.

---

## ADR-0012 — No secrets in code or examples

**Decision:** `.env.example` contains placeholders only. Secret values come from env at
runtime; DB stores `secrets_metadata` references, never material. Provider keys resolved
through `SecretStore` interface (env-backed implementation included).
