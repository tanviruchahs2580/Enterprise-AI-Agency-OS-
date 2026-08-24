# DEVELOPMENT.md

## Layout

```
packages/core            kernel: config, logger, errors, events, ids
packages/db              driver abstraction, migrations, Db facade
packages/security        RBAC matrix, audit hash-chain, approvals
packages/models          model router, circuit breaker, providers, cost math
packages/orchestration   agent roster, task graph, state machine, sandbox,
                         job queue, workflow engine
packages/integrations    GitHub adapter, signed webhook emitter
apps/control-plane       Fastify API + worker registration (deployable)
apps/dashboard           React SPA (deployable)
apps/mcp-server          MCP stdio server for coding agents (deployable)
scripts/                 bootstrap, migrate, seed, self-test, verify-production, sbom
docs/                    architecture, ops and runbooks
```

## Running TypeScript

Node 24 executes `.ts` directly via type stripping (ADR-0003). Consequences:

- Imports use explicit `.ts` extensions.
- **No parameter properties** (`constructor(private x)`) — unsupported by strip-only mode.
- `tsc -b` / `tsc --noEmit` remains the correctness gate; there is no emit step.

## Tests

```sh
npm test                                   # everything (node:test)
node --test packages/core/test/core.test.ts  # single file
```

- Tests are deterministic & offline; the mock model provider stands in for LLMs.
- E2E boots the real Fastify app via `app.inject()` against a temp SQLite file.
- The MCP contract test spawns the server as a child process.

## Database workflow

1. Add `packages/db/src/migrations/000N_description.sql` (never edit applied files —
   the runner enforces checksums).
2. `node scripts/migrate.mjs`
3. Update seed data if needed (`scripts/seed.mjs`, idempotent).

## Local production simulation

```sh
NODE_ENV=staging ADMIN_BOOTSTRAP_KEY=… DATABASE_URL=./data/staging.sqlite \
  node apps/control-plane/src/server.ts
```

(Production itself requires PostgreSQL + docker sandbox — see DEPLOYMENT.md.)

## Debugging tips

- Structured logs go to stdout; filter with `Select-String`/`jq`.
- `GET /ready` shows queue dead-letter count.
- `/api/v1/audit?limit=50` and `/audit/verify` explain what happened and whether
  the trail is intact.
