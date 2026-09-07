# Refactor Quota — W2 (GAP-015)

| | |
|---|---|
| **Document** | `docs/engineering/refactor-quota.md` |
| **Version** | v1.0 |
| **Owner** | Tech Lead |

## Quota

- **Current:** 56 `complexity warn` (10) across `app.ts`, `delivery.ts`, `runtime.ts` etc. [evidence: `npm run lint` → 56 warns, 0 errors].
- **Rule R6:** Zero NEW warns; each sprint refactors ≥10 warns until 0.
- **Split plan:** `executeDelivery` (cx 58) → `createWorktree` / `generateCode` / `runStaticAnalysis` / `runTests` / `heal` / `review` / `commitMerge` (each ≤10) — file `apps/control-plane/src/delivery.ts:85`.
- **Flip:** When 0 warns, `eslint.config.mjs` `complexity: ["warn",10]` → `["error",10]` and CI blocks.

## Change log

- v1.0 — quota + split plan (W2)
