# Security Report — Enterprise AI Agency OS

## Authentication & authorization — PASS
- API keys hashed with SHA-256 (`auth.ts`); never returned in API responses.
- Bootstrap owner key (`ADMIN_BOOTSTRAP_KEY`); one-time creation, rotate/revoke supported.
- RBAC: 11 roles; `requirePermission` enforced per route. Live: VIEWER POST→403;
  missing/wrong/revoked key→401. No privilege escalation observed.

## Secrets handling — PASS
- `npm audit --omit=dev` → 0 vulnerabilities.
- Repo secret scan: no committed keys/tokens. `.gitignore` excludes `data/`, `.env*`.
- Logs emit only key **fingerprints** (first 8 chars), never full secrets.
- `STRICT_SECRET_BACKEND` flag forbids plain-env secrets in production.

## Audit & tamper-evidence — PASS
- Hash-chained append-only audit log (`audit.ts`); each event links to previous hash.
- Sensitive actions (key create/rotate/revoke, approvals, executions) recorded.

## Rate limiting & abuse — PASS
- Memory (dev) and Postgres (prod) stores; default 600 req / 60s.
- Live: 429 + `Retry-After: 60`; backoff respected, no aggressive retry.

## Container & supply chain — PASS
- Non-root `agency` user in `Dockerfile.control-plane`; `cap_drop: ALL`,
  `no-new-privileges`, read-only rootfs in compose.
- CI runs Trivy + gitleaks + SBOM generation.

## SSRF / prompt-injection (scraping-agent items)
- **N/A by architecture**: this product has no outbound web fetcher, so
  SSRF-to-metadata and "scraped page instructs the agent" do not apply. The agent
  treats model output + knowledge docs as DATA; no instruction-execution from
  untrusted content was observed. (If a future fetcher is added, re-run §24/§25.)

## Remaining risk
- **Human SSO/MFA not implemented** (API keys only) — see GAP-1. Until then, operator
  access relies on a long-lived bootstrap key; recommend rotating and adding OIDC.
- **Multi-tenant RLS** not yet enforced at DB layer (GAP-4) — single-org today.

## Verdict
No critical/high security vulnerability with a realistic exploit path. No secrets
committed. Production-ready for its threat model; close GAP-1/4 before multi-tenant GA.
