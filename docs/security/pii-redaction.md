# PII Redaction Middleware — SY-05

| | |
|---|---|
| **Document** | `docs/security/pii-redaction.md` |
| **Version** | v1.0 |
| **Owner** | Security Eng |

## Middleware

- On all agent I/O logs (`knowledge_documents`, `artifacts`, `audit_events`): regex redact `email`, `phone`, `cc`, `api_key` → `[REDACTED]` [evidence: `packages/scraper/src/pii.ts`].
- **30d retention** enforced by nightly job `DELETE FROM audit_events WHERE created_at < now()-30d` [evidence: `packages/db/src/migrations/*`].

## Change log

- v1.0 — redaction + 30d
