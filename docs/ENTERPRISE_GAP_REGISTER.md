# ENTERPRISE GAP REGISTER

Generated 2026-08-26 · Baseline v0.9.1 · Audited scope: full agency OS lifecycle (§3 target).

| Gap ID | Domain | Description | Severity | Risk | Current → Required | Owner | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| GAP-001 | Discovery Engine | No dedicated discovery capture (MISSION_BRIEF, stakeholder map, success metrics gates) before delivery | MEDIUM | Unclear requirements → scope drift | Ad-hoc project description → structured discovery docs + gate check | Product | P1 | OPEN |
| GAP-002 | Multi-Agent | 21 agents seeded but most are contracts; no real LLM behaviour (PM/BA/Arch/QA/SRE) | MEDIUM | Undersells agency promise | 4 specialists wired (stories/DoR/ADR/SLO) → 21 live agents | Arch | P1 | OPEN |
| GAP-003 | Identity | No OIDC/SSO, MFA, SCIM | HIGH | Enterprise SSO/mandated 2FA blocked | API-key only → OIDC issuer + session + claim mapping (E1–E2) | Security | P0 | OPEN |
| GAP-004 | Tenant Encryption | No per-org envelope encryption at rest | MEDIUM | Sensitive knowledge/artifacts not isolated per key | Platform key → per-org data keys + rotation | Security | P1 | OPEN |
| GAP-005 | Knowledge Memory | No vector store (pgvector) → keyword LIKE only | MEDIUM | RAG weak vs semantic need | Hybrid search + embeddings behind FEATURE_VECTOR_KNOWLEDGE | Data | P1 | OPEN |
| GAP-006 | Observability Maturity | No OTel traces, SLO burn alerts, distributed tracing | MEDIUM | Blind spot + no SLO enforcement | Logs/metrics exist → full traces + SLO alerts (6.1–6.2) | SRE | P1 | OPEN |
| GAP-007 | Orchestration Scale | Single-node queue; no horizontal worker pool / leader election / chaos harness | MEDIUM | Can't scale horizontally / chaos unverified | In-proc reclaim (G-05b 84rps proof) → multi-worker + leader lease + chaos (6.3–6.5) | Platform | P1 | OPEN |
| GAP-008 | Sandboxing | Docker network=none optional, not enforced as default; no gVisor/Firecracker | HIGH | Untrusted code escapes host | Docker read_only already on compose; need default network none + syscall profile | Security | P0 | OPEN |
| GAP-009 | Compliance Evidence | No one-click SOC2/ISO pack; retention/legal-hold automation manual | MEDIUM | Audit prep manual | Audit chain exists → automated exporter + retention runbook (7.4–7.5) | Security | P1 | OPEN |
| GAP-010 | Dashboard Depth | Role-based views + rich approval diff + mobile console not yet built | LOW | Ops need raw API today | 12 pages live but admin-centric → roles + approval viewer (#8.1–8.2) | Product/UX | P2 | OPEN |
| GAP-011 | Advanced Enterprise | A2A, browser automation, skill marketplace, customer portal, trial onboarding, BYOK | LOW | Commercial differentiators | Flagged slots exist (FEATURE_A2A etc.) → wiring (Phase 9) | Product | P2 | OPEN |
| GAP-012 | Infrastructure As Code | No Helm/Terraform modules for prod on prem | MEDIUM | Manual prod spin-up | Compose only → helm install + tf modules | Infra | P1 | OPEN |
| GAP-013 | Release Ops Center | No canary/blue-green automation; staging promotion is notification-only | MEDIUM | Production deploy risk | Promotion event exists → executor hooks (Phase 3.3) | Release | P1 | OPEN |
