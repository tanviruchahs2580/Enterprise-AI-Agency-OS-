# Security & Compliance v1.0 — STRIDE + ASVS L2 + RBAC

| | |
|---|---|
| **Document** | `docs/security/threat-model.md` + `rbac.md` + `checklist.md` |
| **Version** | v1.0 |
| **Owner** | Security Eng (security-engineer) |

## 1. CI scanning (Phase 6 — blocks on crit/high)

| Scan | Tool | When |
|---|---|---|
| **SAST** | CodeQL | `ci.yml` + `security.yml` |
| **Deps** | Trivy / Snyk | `docker.yml` `security scan` |
| **Secrets** | gitleaks | `security.yml` |
| **DAST** | OWASP ZAP on `staging` | `security.yml` on PR to `main` |

Zero crit/high at G5.

## 2. STRIDE (per core flow — `threat-model-stride` skill)

Flows: auth (`POST /auth`), task create (`POST /tasks`), deploy (`POST /deployments`). Each flow enumerates **S**poofing/**T**ampering/**R**epudiation/**I**nfo disclosure/**D**oS/**E**levation, mitigations mapped to `requiredPermissions` (`security:threat-model`).

## 3. RBAC matrix (from `TOOL_RISK`)

| Role | Can | Cannot |
|---|---|---|
| OWNER | all | — |
| REVIEW (code-reviewer) | `shell.read` only | `shell.write, git.commit, deploy.production` |
| SECURITY | `security-scan` | `deploy.production` |
| FAST (docs/research/support/finops) | `knowledge.write` / `web.fetch` | `git.commit, deploy.production` |

Enforced in `auth.ts` permission layer, not prompts.

## 4. Compliance

- **OAuth2/OIDC** (`0009_oidc_agency_scale.sql`), session policy 24h.
- **Encryption:** at rest (`OrgKeyEncryption`) + in transit (TLS).
- **PII:** classification in `docs/compliance/pii-register.md` (Phase 6), retention 30d, audit log of sensitive actions (`audit_events`).
- **Patch SLA:** critical ≤24h, high ≤72h.

## 5. Change log

- v1.0 — SAST/DAST + STRIDE + RBAC + PII
