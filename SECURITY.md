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

## Data residency & processing locations

- **Stateful services are non-exfiltrating by default**: the control plane keeps
  all task/knowledge/budget/audit data in its own configured database and only
  reaches the network for declared model providers and documented webhooks.
- **Residency is deployment-defined, not platform-defined.** SQLite runs in-process;
  PostgreSQL runs wherever you host it. Nothing is uploaded to this project's
  infrastructure — there is no managed cloud endpoint in the data path.
- Configured locations (see OPERATIONS.md, "regions"):
  - primary DB region — set at deploy time (`DATABASE_URL`); record it in the
    runbook for your environment
  - model-provider region — depends on the upstream MODEL_PROVIDER_BASE_URL;
    document it if you must guarantee residency
- Customers/tenants are partitioned by organization; cross-org reads are blocked
  server-side and covered by e2e tests. Ambition: per-workspace encryption keys
  (ROADMAP v0.12).

## Encryption

- **At rest**: platform tables that hold secrets store hashes only (API keys as
  SHA-256, session tokens hashed). Full-disk encryption for the data store is
  the deployment operator's obligation; enable it on the volume backing
  `DATABASE_URL` (LUKS/encrypted EBS/encrypted disk on VMs) and record this in
  the deployment runbook.
- **In transit**: HTTPS required in production (`NODE_ENV=production` refuses
  non-TLS CORS origins and non-Secure cookie issuance gate exists via
  `SESSION_COOKIE_SECURE`); all outbound provider calls flow over TLS.
- **Key handling**: single admin bootstrap key is env-only, never logged in full,
  refused unless explicitly supplied in production. Session cookies are httpOnly
  + SameSite=Strict; the raw key is never persisted in browser storage.

## Compliance posture

- GDPR / CCPA-style records, erasure and breach timelines:
  - `docs/compliance/RECORDS-OF-PROCESSING.md` — categories, purposes, retention
  - `docs/compliance/DPA-TEMPLATE.md` — data-processing agreement for tenants
  - `docs/compliance/BREACH-NOTIFICATION-SLA.md` — breach SLA + notification template
- **Current status: self-assessment.** Independent SOC 2 / pentest is not yet
  scheduled (audit Phase 4); do not advertise certifications you do not hold.
  The audit control matrix that produced these docs is the source of truth.

## Secure defaults

- `NODE_ENV=production` refuses: missing admin key, SQLite database, wildcard CORS,
  process sandbox provider.
- Rate limiting enabled out of the box.
- CORS restricted to explicit origins.
