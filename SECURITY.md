# SECURITY.md

## Reporting

Email the maintainers via GitHub Security Advisories ("Report a vulnerability"
on this repository). Do not open public issues for security bugs.

## Threat model (STRIDE summary)

| Threat | Vector | Control |
|---|---|---|
| Spoofing | Stolen API keys | Keys stored as SHA-256 hashes; revocation; `last_used_at` visibility; production requires explicit admin key |
| Tampering | DB edits to audit trail | Hash-chained audit (`sha256(prev+event)`), online `/audit/verify`, checksummed migrations |
| Repudiation | "who did X?" | Every sensitive action appends an audit event with actor, risk level and decision |
| Information disclosure | Secrets in logs/prompts | Logger redaction list; secret metadata-only storage; prompt retention off by default; `.env` git-ignored + gitleaks CI |
| Denial of service | API flood, runaway agents | Token-bucket rate limiting; agent max_iterations/max_cost/max_duration; budget guards at 6 scopes |
| Elevation of privilege | Agents calling dangerous tools | Tool permission matrix; approval gates for deploy:production, secrets.rotate, destructive migrations; RBAC enforced server-side |

## LLM-specific risks

- **Prompt injection** — external content is treated as untrusted data. The worker
  system prompt explicitly forbids following instructions embedded in task text;
  the tool layer enforces permissions regardless of model output.
- **Model fallback abuse** — fallbacks are never silent; every attempt is recorded
  in `model_requests` with reason, latency, tokens and cost.
- **Cost attacks** — pre-flight budget estimate blocks spend before any provider call.

## Supply chain

- Lockfile-pinned dependencies; Dependabot weekly.
- CI secret scanning (gitleaks) on every PR/push.
- CycloneDX SBOM generated in security workflow & attached to releases.
- Docker images pinned by tag; non-root runtime user; no socket mounts by default.

## Data protection

- PII/secret redaction in structured logs (case-insensitive key matching).
- Configurable retention: delete knowledge/artifacts per policy (OPERATIONS.md).
- GDPR erasure: soft-delete (`deleted_at`) + documented erasure runbook.

## Secure defaults

- `NODE_ENV=production` refuses: missing admin key, SQLite database, wildcard CORS,
  process sandbox provider.
- Rate limiting enabled out of the box.
- CORS restricted to explicit origins.
