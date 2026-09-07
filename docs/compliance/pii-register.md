# PII Register v1.0

| | |
|---|---|
| **Document** | `docs/compliance/pii-register.md` |
| **Version** | v1.0 |
| **Owner** | Security Eng + DBA |

| Data | Classification | Retention | Location | Encryption |
|---|---|---|---|---|
| `api_keys.key_hash` | **Confidential** | Until rotation | `api_keys` | hashed + at rest |
| `users.email` | **PII** | 30d after deletion | `users` | at rest |
| `knowledge_documents` | **Internal** | 90d | `knowledge_documents` | at rest |
| `evidence_records.content` | **Internal** | 30d | `evidence_records` | hash-verified |

Lower envs use **masked fixtures**, never prod data (Phase 8).

## Change log

- v1.0 — initial classification
