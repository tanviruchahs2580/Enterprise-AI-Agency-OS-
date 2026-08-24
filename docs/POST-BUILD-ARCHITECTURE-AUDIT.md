# POST-BUILD ARCHITECTURE AUDIT

Actual architecture reconstructed from code inspection (2026-08-24), compared
with the intended master-prompt architecture.

## Actual runtime topology

```
Browser ──► dashboard SPA (static, vite build)
              │ /api proxy (dev: vite, prod: nginx)
              ▼
        control-plane (Fastify, single process)
          ├── onRequest: rate-limit → API-key auth → identity
          ├── routes (RBAC per route) ──► services
          ├── EventBus (in-proc) ──► SSE fan-out
          ├── JobQueue worker loop (in-proc) ──► execute_task handler
          │       └── ModelRouter ──► providers (mock | OpenAI-compatible)
          ├── AuditLog (hash chain) ──► SQLite/Postgres
          └── WorkflowEngine (checkpointed state machine)
MCP clients (OpenCode) ──stdio JSON-RPC──► mcp-server ──REST──► control-plane
```

## Data flow integrity

| Flow | Verified path |
|---|---|
| AuthN/Z | bearer→sha256 lookup→role→`requirePermission` per route (e2e 401/403) |
| Task lifecycle | POST /tasks → graph validation → transitions guarded by state machine + optimistic lock (e2e concurrency test) |
| Execution | dispatch→execution row→job(idempotency key)→worker claim(atomic UPDATE)→router→artifact+handoff+cost_events→events (new e2e covers end-to-end) |
| Approval gate | request→pending→decide(expiry-checked)→audit; `assertApproved` before production deploys (e2e both directions) |
| Audit chain | append-only seq; hash=sha256(prev+canonical(event)); verify recomputes (unit tamper test) |
| Knowledge | handoff docs written by worker; search via LIKE; kinds distinguish fact/assumption/hypothesis |

## Findings

### Fixed during this audit
1. **Disconnected component**: worker read job payload at wrong nesting level —
   every dispatched execution would dead-letter. Reconnected + regression e2e.
2. **State machine gap**: ready→in_progress illegal but worker attempted it and
   swallowed the error, leaving tasks stuck in ready after execution. Now
   advances through the legal path.
3. **Falsy-zero TTL**: approval expiry unenforceable through the API.
4. **Routing dead-end**: seeded agent contracts require STANDARD tier; default
   provider set lacked one → all standard-tier dispatches failed selection.

### Remaining gaps (documented, not hidden)
- **Dead schema**: `reviews`, `gate_results`, `quality_gates`, `notifications`,
  `integrations`, `secrets_metadata` tables exist but have no API surface yet
  (v0.2 scope per ROADMAP). Not fake — they are forward schema, clearly unused.
- **Duplicate orchestration engines**: none (single engine).
- **Vendor lock-in**: low — provider interfaces for models/sandbox/git/knowledge.
- **Scalability limits**: single-process worker + in-memory SSE/rate-limits;
  multi-replica requires Postgres driver + external pub/sub (ROADMAP v0.2).
- **Hidden coupling**: control-plane wires all packages in context.ts (intentional
  composition root); packages themselves do not import apps.

## Verdict

Architecture matches the intended layered model; the four defects above were the
only disconnects between "implemented" and "functioning", and all are fixed with
regression coverage.
