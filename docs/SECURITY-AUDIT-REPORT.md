# SECURITY AUDIT REPORT

Date: 2026-08-24 · Scope: full repository + live API behavior

## Scan results

| Check | Tool | Result |
|---|---|---|
| Secret scan (repo + history) | gitleaks (GitHub Actions run 32746415175) | SUCCESS — no secrets |
| Dependency audit (prod graph) | npm audit --omit=dev --audit-level=high | **0 vulnerabilities** |
| Dev-graph audit | npm audit | 1 moderate accepted risk (esbuild dev-server, see DEPENDENCY-AUDIT.md) |
| SBOM | scripts/generate-sbom.mjs → CycloneDX | generated; attached to release v0.1.0 |
| Manual secret grep | patterns: key/secret/token/password across src, tests, docs, fixtures | only placeholders & `[REDACTED]` markers |

## OWASP Top 10 spot-check (API behavior, evidence-based)

| Category | Control verified |
|---|---|
| A01 Broken access control | RBAC per route; tenant isolation e2e (cross-org invisible); engineer role denied privileged ops |
| A02 Cryptographic failures | API keys stored SHA-256 only; HMAC for outbound webhooks; no secrets in DB material |
| A03 Injection | SQL: parameterized statements exclusively (`Db.insert/run` bind); command injection: sandbox `assertCommandSafe` blocks destructive patterns before spawn |
| A04 Insecure design | Approval gates enforced at service layer, not prompts; production config fail-fast |
| A05 Misconfiguration | production requires explicit admin key, Postgres, docker sandbox; wildcard CORS refused |
| A07 AuthN failures | 401 on missing/forged keys; revoked keys rejected; last_used_at tracked |
| A08 Integrity | migration checksums; audit hash chain; quality receipts hashed |
| A09 Logging failures | structured logs w/ redaction list; audit events for sensitive ops with risk levels |
| A10 SSRF | No user-supplied URL fetching in runtime paths; provider base URLs are operator-configured env |

## Prompt-injection posture

- Worker system prompt marks task content as DATA and forbids instruction-following
  from it.
- Tool permissions resolve from agent contracts in DB — model output cannot
  elevate itself.
- Unverified knowledge is labeled (`verification_status`) and never auto-promoted.

## Findings ledger

| Severity | Finding | Status |
|---|---|---|
| high | (none open) | — |
| medium | esbuild dev-server advisory (dev-only) | ACCEPTED RISK, documented |
| low | SSE token via query param `?auth=` (EventSource limitation) | documented; recommend reverse-proxy header auth in production |
| low | rate-limit buckets keyed by bearer prefix | acceptable entropy; per-IP fallback exists |
