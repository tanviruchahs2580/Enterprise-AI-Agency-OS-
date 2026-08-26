# Enterprise AI Agency OS

Production-grade, self-hostable **AI Software Agency Operating System**: a control plane
that orchestrates autonomous engineering agents through the full SDLC — discovery,
requirements, architecture, implementation, review, security, QA, deployment,
observability and knowledge — with human approval gates, budgets, sandboxing and a
tamper-evident audit trail.

> Status: v0.7.0 — see [PROGRESS.md](PROGRESS.md) for the live build ledger. | [FINAL-EXECUTIVE-REPORT-v0.5.1](docs/FINAL-EXECUTIVE-REPORT-v0.5.1.md) | [PRODUCTION-CERTIFICATION-REPORT](docs/PRODUCTION-CERTIFICATION-REPORT.md)

## What it gives you

- **Control Plane API** (`apps/control-plane`) — Fastify REST API `/api/v1` with RBAC,
  approvals, rate limiting, structured errors, SSE live events, health/readiness.
- **Model Router** (`packages/models`) — provider-agnostic routing by task tier,
  capability, cost budget and health; circuit breakers; every fallback recorded.
- **Orchestration** (`packages/orchestration`) — agent registry (21 enterprise roles),
  task dependency graph with cycle detection, deterministic YAML workflow engine,
  resumable sessions, job queue with retry/backoff/DLQ.
- **Security kernel** (`packages/security`) — RBAC matrix, human approval gates for
  high-risk actions, hash-chained append-only audit log with online verification.
- **Persistence** (`packages/db`) — versioned SQL migrations; SQLite out of the box
  (zero native deps), PostgreSQL profile for production.
- **Dashboard** (`apps/dashboard`) — real-data enterprise console: projects, kanban,
  agents, model spend, security findings, approvals, deployments, audit chain viewer.
- **MCP server** (`apps/mcp-server`) — safe OpenCode/MCP tools over the control plane.
- **CI/CD & supply chain** — GitHub Actions (lint/type/test/build, gitleaks), SBOM,
  Dependabot, digest-pinned images.

## Quick start (no Docker required)

```powershell
# Windows
./scripts/bootstrap.ps1
```

```sh
# macOS / Linux
./scripts/bootstrap.sh
```

Then open:

- Dashboard: http://localhost:5173 (dev) or http://localhost:8080 (served)
- API: http://localhost:3000/api/v1
- Health: http://localhost:3000/health · /ready · /live

The bootstrap prints a one-time **admin API key**. Store it; it is the `OWNER` identity.

## One-command operations

```sh
make dev            # start control plane + dashboard (dev)
make test           # full test suite (unit + integration + e2e)
make lint           # eslint
make typecheck      # tsc project references
make self-test      # environment diagnostics (db, config, providers…)
make verify-production   # production readiness gate
```

## Documentation

| Doc | Purpose |
|---|---|
| [QUICKSTART](docs/QUICKSTART.md) | 10-minute setup |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | System design & diagrams |
| [SECURITY](SECURITY.md) | Threat model, controls, disclosure |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Compose / production |
| [OPERATIONS](docs/OPERATIONS.md) | Runbooks, backup/restore |
| [MODEL-ROUTING](docs/MODEL-ROUTING.md) | Tiers, policies, fallbacks |
| [AGENTS](AGENTS.md) | Roster & contracts |
| [SKILLS](SKILLS.md) | Skill registry |
| [WORKFLOWS](WORKFLOWS.md) | Workflow engine & definitions |
| [API](docs/API.md) | REST reference |
| [DISASTER-RECOVERY](docs/DISASTER-RECOVERY.md) | RPO/RTO, recovery steps |
| [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) | Common failures |

## License

Apache-2.0 — see [LICENSE](LICENSE).
