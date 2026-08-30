# Kubernetes Deployment Guide

Ships a Helm chart (`charts/agency-os`) that deploys the control plane and the
dashboard, matching the production semantics of `docker-compose.yml`. This guide
covers both profiles — PostgreSQL (recommended for Kubernetes) and SQLite.

## Requirements

- A Kubernetes cluster ≥ 1.25.
- Helm ≥ 3.12 (`helm version`).
- Container registry access to the `agencyos/control-plane` and
  `agencyos/dashboard` images.
- An ingress controller (nginx, traefik, …) if you enable `ingress`.

## Install

```sh
helm repo add agency-os https://charts.example.com   # or local path
# Local checkout
helm install agency-os ./charts/agency-os --create-namespace --namespace agency-system \
  --set-json 'controlPlane.secret={"DATABASE_URL":"postgres://agency:CHANGE-ME@agency-os-postgresql:5432/agencyos","ADMIN_BOOTSTRAP_KEY":"CHANGE-ME"}'
```

For anything beyond a smoke test, don't inline secrets — use the operator stack:

```sh
helm install agency-os ./charts/agency-os -n agency-system \
  --set controlPlane.existingSecret=agency-os-secrets \
  --set postgresql.existingSecret=agency-os-pg \
  --set controlPlane.secretBackend=vault \
  --set controlPlane.vault.addr=https://vault.example.com \
  --set controlPlane.vault.roleId=... \
  --set controlPlane.secretId.secret=...
```

Provision `agency-os-secrets` with External Secrets Operator (or the HashiCorp
Vault Secrets Operator) containing at minimum:

```
DATABASE_URL=postgres://agency:...@agency-os-postgresql:5432/agencyos
ADMIN_BOOTSTRAP_KEY=<long random>
MODEL_PROVIDER_API_KEY=<provider key>     # optional
WEBHOOK_OUTBOUND_SECRET=<hmac secret>     # optional
```

## Profiles

### PostgreSQL (recommended)

`postgresql.enabled=true` (the default) deploys a single-node PostgreSQL 16 plus
a 10 Gi PVC. The control plane's `DATABASE_URL` points at
`<release>-agency-os-postgresql:5432`. Backups are your responsibility — run
`pg_dump`/WAL archiving to object storage.

### SQLite (single replica)

Set `postgresql.enabled=false`. The control plane claims a PVC at `/app/data`
and is strictly single-writer:

- Keep `replicaCount: 1`.
- Do **not** enable `autoscaling` (HPA would run a second writer pod).
- `podDisruptionBudget.minAvailable` should stay `1`.

## Vault-backed secrets

Set `controlPlane.secretBackend=vault`. Boot then primes the in-memory
resolver from `{VAULT_ADDR}/v1/{VAULT_KV_MOUNT}/data/{VAULT_PATH_PREFIX}/{NAME}`
for `MODEL_PROVIDER_API_KEY`, `WEBHOOK_OUTBOUND_SECRET`, `GITHUB_TOKEN`
(Logger: a missing secret is a `warn`, not a boot failure). KV secrets may store
either a `value` key or a field named after the secret.

## Validate a deployment

```sh
helm template agency-os ./charts/agency-os | kubectl apply --dry-run=client -f -
kubectl -n agency-system get pods
kubectl -n agency-system port-forward svc/control-plane 3000:3000
curl http://127.0.0.1:3000/ready
```

## DefSec posture (defaults)

| Control | Default | Where |
|---|---|---|
| Read-only rootfs | control plane + dashboard | `Deployment.securityContext` |
| Non-root | control plane (UID `agency`) | fsGroup 1001 + `runAsNonRoot` |
| Capabilities | drop ALL, broadened only for nginx | mirror compose hardening |
| Network policy | default-deny per pod; DNS + app paths allowed | `networkpolicy.yaml` |
| HPA | off (SQLite single-writer) | enable per profile |
| PDB | off by default; set `minAvailable` | enable per team |

Model-provider egress: the control-plane `NetworkPolicy` is default-deny for
egress beyond DNS and PostgreSQL. Add target selectors under
`controlPlane.egressAllow` for your LLM gateways / ingress proxy.

## Upgrades

Migrations run on boot (idempotent, reversible-only by policy). Perform a
rolling upgrade:

```sh
helm upgrade agency-os ./charts/agency-os -n agency-system -f values-prod.yaml
```

Database migrations are **not** run from a Job — boot-time migration is the
supported path. For blue/green schema changes, `helm diff upgrade` the matching
app version before promoting.

## Troubleshooting

- `CrashLoopBackOff` on control plane → `kubectl logs` shows a
  `boot_failed` JSON line with the config validation reason (fail-fast boot is
  intentional).
- Dashboard 502s on `/api/*` → confirm the control-plane `Service` is named
  `control-plane` (the stock dashboard image proxies to
  `http://control-plane:3000`) or rebuild the dashboard image with your
  service name.
- Readiness stuck → `/ready` reflects DB connectivity; with SQLite, check the
  PVC is mounted (`VOLUME` + `fsGroup`).