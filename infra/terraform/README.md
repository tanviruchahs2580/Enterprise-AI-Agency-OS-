# IaC v1.0 — Terraform Stub (Staging Prod Parity)

| | |
|---|---|
| **Document** | `infra/terraform/main.tf` |
| **Version** | v1.0 |
| **Owner** | DevOps |

```hcl
# Phase 4 stub — staging prod parity (apply after G1)
terraform {
  required_version = ">= 1.5"
  required_providers { docker = { source = "kreuzwerker/docker" } }
}
# provider "aws" / "docker" — staging is docker compose prod parity per environments.md
# Modules: network, db (Postgres), control-plane (non-root image), dashboard
# State: remote backend (S3 + DynamoDB) — never local
# Outputs: control_plane_url, dashboard_url
```

**Non-root Docker (multi-stage):**

```dockerfile
# Phase 4 — apps/control-plane/Dockerfile (multi-stage, non-root)
FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:24-alpine
RUN adduser -D app && USER app
COPY --from=build /app .
CMD ["node", "apps/control-plane/src/server.js"]
```

Immutable tags `vX.Y.Z` only; `latest` never in prod.
