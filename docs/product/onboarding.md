# Onboarding — 15-Minute Setup (Docs-as-Code)

| | |
|---|---|
| **Document** | `docs/product/onboarding.md` |
| **Version** | v1.0 |
| **Owner** | Tech Writer (documentation-engineer) |

## 1. 15-min test (fresh human/agent, docs only)

```bash
git clone <repo> && cd "Enterprise AI Agency OS"
npm ci --no-audit --no-fund
npm run lint && npm run typecheck && npm test   # expect 235/235
npm run dev  # control-plane :3000 + dashboard :5173
curl http://localhost:3000/api/v1/meta | jq .version  # expect 0.12.0
```

Exit: `docs/product/onboarding.md` is the Single Source of Truth for setup (P5); if above fails, docs are the bug.

## 2. API docs

- Source: `openapi.yaml` (OAS 3.1) — auto-generated to `docs/api/*` via `npx redoc-cli bundle openapi.yaml`.
- Updated in **same PR as code** (DoD item).

## 3. Runbooks

- `docs/runbooks/rollback.md`, `docs/sre/slo.md`, `docs/data/backup-dr.md` — each runbook tested end-to-end in Phase 7/8.

## 4. Change log

- v1.0 — 15-min onboarding + docs-in-same-PR
