# Decision Log v1.0

| | |
|---|---|
| **Document** | `docs/governance/registers/decision.md` |
| **Version** | v1.0 |
| **Owner** | Principal |
| **Format** | MADR-lite — every decision is versioned, never in chat memory (P5) |

| ID | Date | Title | Context | Options considered | Decision | Owner | Status |
|---|---|---|---|---|---|---|---|
| DEC-001 | 2026-08-31 | Agent redesign stays uncommitted until G1 | Master prompt Hard Rule 1 (no code before G2) vs prior “agents-only” constraint | (a) commit now / (b) keep local, gate at G1 | **(b)** 8-file redesign stays local, verified `235/235`, merges at G1 after SDLC+RACI ACK | Principal | **Accepted** |
| DEC-002 | 2026-08-31 | Map `TOOL_RISK` for 6 missing tools | Security audit GAP-007 | (a) ignore / (b) add entries `task-dispatch` `docs-write` `diagrams` `security-scan` `load-test` `observability-read` | **(b)** added in `agents.ts` | Security Eng | **Accepted** |
| DEC-003 | 2026-08-31 | `enterprise-feature` parallelism model | CMMI 2→3 + DORA throughput | (a) stay sequential / (b) 6 fan-outs (17 branches) | **(b)** fan-out (see `workflow.ts`) — wall time ∝ critical path, not headcount | Architect | **Accepted** |
| DEC-004 | 2026-08-31 | 12-factor + vault for secrets | Hard Rule 3 | (a) env files / (b) vault + 12-factor | **(b)** Phase 4 | DevOps | **Proposed** |

## Process

- Proposing agent writes row; Accountable (Principal) approves.
- Long-form ADRs → `docs/adr/ADR-####.md` (MADR); this log is the index.
