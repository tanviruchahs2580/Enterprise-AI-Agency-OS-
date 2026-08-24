# SECURITY RUNBOOK

## Continuous controls (already automated)

| Control | Where |
|---|---|
| Secret scanning | gitleaks on every push/PR (.github/workflows/security.yml) |
| Dependency audit | npm audit prod graph, high+ gate |
| SBOM | generated per release + security workflow artifact |
| Image scan | Trivy critical/high gate (.github/workflows/docker.yml) |

## API key lifecycle

1. **Issue** — `AuthService.createKey(orgId, name, role)` returns material ONCE;
   store hash only. Deliver via secret channel.
2. **Rotate** — create new key, update consumers, then revoke old:
   `UPDATE api_keys SET revoked_at = now() WHERE id = …` (immediate 401s).
   Bootstrap admin key: set a new `ADMIN_BOOTSTRAP_KEY`, run
   `node scripts/seed.mjs` (idempotent), then revoke the old key row.
3. **Compromise** — revoke first, rotate providers second, inspect
   `api_keys.last_used_at` + audit log for the exposure window.

## Access reviews (monthly)

- List keys: `SELECT name, role, last_used_at, revoked_at FROM api_keys`.
- Remove stale keys (>30d unused).
- Verify no ENGINEER/QA role holds approval:decide paths in practice:
  spot-check `audit_events WHERE action LIKE 'approval.%' AND actor_type='user'`.

## Verification commands

```sh
npm audit --omit=dev --audit-level=high
node scripts/self-test.mjs
curl -fsS $HOST/api/v1/audit/verify -H "authorization: Bearer $KEY"
```

## Known accepted risks

See docs/SECURITY-AUDIT-REPORT.md findings ledger (dev-only esbuild advisory,
per-instance rate buckets until Redis backplane).
