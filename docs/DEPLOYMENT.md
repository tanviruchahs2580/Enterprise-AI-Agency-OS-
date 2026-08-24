# DEPLOYMENT

## Environments

| Profile | Database | Sandbox | Notes |
|---|---|---|---|
| local | SQLite file | process | default; no Docker needed |
| test | `:memory:` / temp SQLite | process | CI matrix (ubuntu+windows) |
| staging | PostgreSQL recommended | docker or process | full compose profile |
| production | **PostgreSQL required** | **docker required** | fail-fast config gate |

## Docker Compose

```sh
cp .env.example .env
# set ADMIN_BOOTSTRAP_KEY, POSTGRES_PASSWORD, GRAFANA_PASSWORD…
docker compose --profile postgres --profile observability up -d --build
```

Services:

- control-plane → :3000 (health `/health`, `/ready`, `/live`)
- dashboard → :8080 (nginx serving SPA, proxying `/api`)
- postgres → internal (profile `postgres`), set `DATABASE_URL=postgres://agency:…@postgres:5432/agencyos`
- prometheus/grafana → observability profile (:9090 / :3001)

### Production hardening checklist

- [ ] `ADMIN_BOOTSTRAP_KEY` set to a 32+ byte random value
- [ ] TLS terminated at your ingress/proxy in front of both apps
- [ ] `SANDBOX_PROVIDER=docker`; decide deliberately about docker.sock mounting
      (only if agents must build/run containers — isolate that host)
- [ ] Backups scheduled (see OPERATIONS.md) and restore tested
- [ ] Budgets configured (`POST /api/v1/budgets`) for org/daily/monthly scopes
- [ ] Grafana admin password changed; sign-ups disabled (default)

## Kubernetes (architecture-ready)

The control plane is a stateless container + a volume for SQLite (dev only) or a
PostgreSQL connection. To deploy on K8s:

1. Use the same image as compose (`docker/Dockerfile.control-plane`).
2. Provide configuration via Secret/ConfigMap env vars (all config is env-driven).
3. Run one replica of the API deployment; scale workers by running additional
   replicas with the same database — job claims are atomic and multi-worker safe.
4. Liveness: `/live`; readiness: `/ready`.

Helm charts are intentionally not shipped yet (ROADMAP v0.2).

## Rollback strategy

Deployments are recorded with `commit_sha` and version. Rollback creates a new
corrective deployment row (`rollback_of`) and requires the `deployment:rollback`
permission plus an approval gate when policy demands it. Compose-level rollback:
redeploy the previous image tag (`docker compose up -d` with previous digest).
