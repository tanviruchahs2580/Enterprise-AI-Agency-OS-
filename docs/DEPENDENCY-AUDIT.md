# DEPENDENCY AUDIT

Date: 2026-08-24 · Method: `npm audit`, `npm ls`, registry checks, lockfile diff.

## Runtime dependency graph (production)

| Package | Resolved | License | Used for | Audit |
|---|---|---|---|---|
| fastify | ^5 | MIT | HTTP API | clean |
| zod | ^3 | MIT | config validation | clean |
| yaml | ^2 | ISC | workflow definitions | clean |
| react / react-dom | ^18.3.1 (dashboard) | MIT | UI | clean |
| react-router-dom | **7.18.2** (upgraded from 6.26 during this audit) | MIT | SPA routing | **clean after upgrade** |

## Dev toolchain

typescript 5.9 · eslint 9 + typescript-eslint 8 · vite 5.4 + @vitejs/plugin-react ·
@types/node 24 — all clean except esbuild advisory below.

## Changes made during verification

1. **react-router-dom 6.26 → 7.18.2** — security-driven upgrade.
   Advisories GHSA-wrjc-x8rr-h8h6 (open redirect) & GHSA-337j-9hxr-rhxg affected
   the 6.x line. v7 kept the data-router APIs we use; typecheck + dashboard build
   green post-upgrade. No API surface change for this app.
2. No other upgrades — deliberate churn avoidance per change-control rule.

## Accepted risks

| Advisory | Severity | Why accepted | Trigger to revisit |
|---|---|---|---|
| esbuild ≤0.24.2 dev-server request exposure (GHSA-67mh-4wv8-2f99) | moderate | dev-server only; never shipped in build artifacts; production serves static files via nginx | vite@8 major upgrade (ROADMAP v0.2) |

`npm audit --omit=dev --audit-level=high` → **found 0 vulnerabilities**.
