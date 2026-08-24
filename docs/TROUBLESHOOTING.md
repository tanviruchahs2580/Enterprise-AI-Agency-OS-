# TROUBLESHOOTING

## Boot failures

| Symptom | Cause | Fix |
|---|---|---|
| `production requires ADMIN_BOOTSTRAP_KEY` | production gate | set the env var |
| `production requires PostgreSQL DATABASE_URL` | production gate | point at `postgres://…` |
| `wildcard CORS is forbidden` | CORS_ORIGIN contains `*` | list explicit origins |
| Port in use (EADDRINUSE) | another process on 3000 | change `PORT` |
| `migration checksum drift` | applied migration file edited | restore file or follow OPERATIONS.md incident flow |

## Runtime issues

**401 UNAUTHENTICATED everywhere**
The admin key printed once at first boot differs from the one you're using.
Re-run `node scripts/seed.mjs` with `ADMIN_BOOTSTRAP_KEY` set to pin a known key,
or create a new key via a script (`AuthService.createKey`).

**Dashboard shows "Control plane unreachable"**
Dev server proxies `/api` → `http://127.0.0.1:3000`. Ensure the API is running
(`npm run dev` starts both) and not bound to a different host.

**Executions stay queued**
Workers run inside the control-plane process. If you started the server with
custom code that skipped `registerWorkers`, no consumer exists. Check
`GET /api/v1/jobs/stats`.

**Model calls fail with PROVIDER_FAILURE**
Only the mock provider is configured by default. Add a real provider via
`MODEL_PROVIDER_API_KEY`/`MODEL_PROVIDER_BASE_URL`, or expect mock-only behavior.

**BUDGET_EXCEEDED on small requests**
A budget row (daily/org/task…) is tighter than estimated cost. Inspect
`GET /api/v1/costs/summary` → budgets, then raise via `POST /api/v1/budgets`.

**SSE stream silent**
EventSource needs `?auth=<key>`; also some corporate proxies buffer SSE —
disable buffering for `/api/v1/events`.

**Windows: EPERM removing temp dirs in tests**
WAL files release asynchronously; tests already retry — safe to ignore.

## Diagnostics bundle

```sh
node scripts/self-test.mjs > diagnostics.txt
curl -s localhost:3000/ready >> diagnostics.txt
curl -s -H "authorization: Bearer $KEY" localhost:3000/api/v1/jobs/stats >> diagnostics.txt
```
