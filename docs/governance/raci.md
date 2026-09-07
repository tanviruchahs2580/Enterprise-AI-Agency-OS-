# RACI Matrix v1.0 — Every Artifact Type

| | |
|---|---|
| **Document** | `docs/governance/raci.md` |
| **Version** | v1.0 |
| **Date** | 2026-08-31 |
| **Owner** | Orchestrator (captain) |

**Legend:** **R** Responsible (does), **A** Accountable (owns, single per row), **C** Consulted, **I** Informed. Human approvers in **bold** per Hard Rule 10 (never self-assigned by an agent).

| # | Artifact type | Path / example | R | A | C | I |
|---|---|---|---|---|---|---|
| 1 | **Product — PRD + Stories + AC** | `docs/product/PRD-PRJ-###.md` | PM (product-manager) | **Human** (G0) | Architect, QA | Captain, SRE |
| 2 | **Design — HLD/LLD, C4** | `docs/architecture/hld.md`, `lld-*.md` | Architect | **Human** (G1) | Staff Eng, Security, DBA | PM, QA |
| 3 | **Decision — ADR** | `docs/adr/ADR-####.md` (MADR) | Proposer (any) | **Principal** | Architect | All |
| 4 | **API contract — OpenAPI 3.1** | `openapi.yaml` | Architect + Backend Eng | **Human** (G1) | Frontend, QA, Security | Docs Eng |
| 5 | **Ticket / Sprint plan** | `PROJ-###`, `docs/delivery/sprint-*.md` | Orchestrator (captain) | **Human** (G2) | PM, Tech Lead | All |
| 6 | **Code + Tests** | PR `PROJ-###` | SWE (FE/BE/Staff) | **Tech Lead** (G3) | QA, Security | Orchestrator |
| 7 | **Review verdict** | PR reviews (standards + adversarial axes) | code-reviewer + adversarial-reviewer | **Tech Lead** | SWE | Principal |
| 8 | **Security report** | `docs/security/*` | Security Eng | **Human** (G5, high-risk) | Architect, SWE | QA, SRE |
| 9 | **Test report + QA sign-off** | `docs/qa/test-report-PRJ-###.md` | QA | **QA** (G4) | SWE, PM | Orchestrator |
| 10 | **CI/CD — pipeline, IaC, images** | `.github/workflows/*`, `infra/terraform/*`, `Dockerfile` | DevOps | **DevOps** | SRE, Security | All |
| 11 | **Release — SemVer, changelog, rollback plan** | `CHANGELOG.md`, `docs/runbooks/rollback.md`, `sbom-*.json` | Release Mgr | **Human** (G5) | DevOps, SRE | All |
| 12 | **Observability — SLOs, dashboards, runbooks** | `docs/sre/slo.md`, `docs/runbooks/*` | SRE | **SRE** (G6) | Performance Eng, DevOps | Principal, Orchestrator |
| 13 | **Data — migrations, backups, DR** | `packages/db/src/migrations/*`, `docs/data/*` | DBA | **DBA** (G6) | Backend, SRE | Security |
| 14 | **Documentation — README, RUNBOOKS, ONBOARDING, API docs** | `README.md`, `docs/runbooks/*`, `docs/api/*` | Tech Writer (docs-engineer) | **Tech Writer** | SWE, Architect | All |
| 15 | **Delivery — risk/tech-debt/decision/change-request registers** | `docs/governance/registers/*.md` | Orchestrator | **Principal** | All | All |
| 16 | **Client comms — RAG, demo, escalation matrix** | `docs/delivery/rag-*.md`, `docs/delivery/escalation.md` | Orchestrator | **Human** | PM | All |
| 17 | **Handoff contracts** | `agent_handoffs` + `knowledge_documents(kind=handoff)` | Sender agent | **Receiver** (validates) | Captains | Orchestrator |
| 18 | **Evidence records** | `evidence_records` (hash-verified) | Producing agent | **QA** (verifies) | Security | All |

**Rule:** One **A** per row. Agents never `A` for human gates G0/G1/G5.

## Change log

- v1.0 — initial RACI (covers §6 agent roster + §9 templates)
