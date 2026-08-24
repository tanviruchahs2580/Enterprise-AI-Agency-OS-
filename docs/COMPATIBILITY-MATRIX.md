# COMPATIBILITY MATRIX

How blueprint references map into this implementation. "Verified" = actually executed here.

| Blueprint reference | Role in our system | Integration type | Status | License check |
|---|---|---|---|---|
| OpenHands runtime/sandbox | Sandbox isolation concept | Reimplemented (`SandboxProvider`: process/docker) | Implemented; docker path BLOCKED locally (no Docker) | n/a (no dependency) |
| The Agency ISCP (SQLite dispatch/flags) | Cross-session coordination | Reimplemented via domain_events + jobs + checkpoints | Implemented & tested | n/a |
| The Agency QGR/RGR receipts | Quality verification receipts | Reimplemented (hash-chained, `quality_receipts` semantics on tasks + audit chain) | Implemented & tested | n/a |
| Superpowers methodology | Outer loop discipline | Encoded as workflow YAML (brainstorm→plan→execute→verify) | Implemented | n/a |
| mattpocock skills (tdd, code-review 2-axis…) | Inner-loop disciplines | Encoded as agent system prompts + skill registry entries | Implemented | n/a |
| gstack browse daemon | Browser QA automation | Interface only: `BrowserAutomationProvider` + feature flag `browserAutomation` (off by default) | Deferred (flag off) — no compatible verified runtime on this machine | n/a |
| Agentic SOC platform | Security operations | Concepts implemented natively: findings, cases flow (alert→case→investigation→approval), TI-enrichment stub interface | Core implemented; SIEM connectors deferred | n/a |
| Hermes agent (voice/A2A/webhooks) | Multi-surface fleet | Outbound signed webhooks implemented; A2A/voice behind flags (off) | Partial (webhooks done) | n/a |
| LangGraph | Workflow graphs | NOT used — own typed engine (ADR-0005) | Decision recorded | n/a |
| spec-kitty / mission-control | Kanban + spend governance | Native dashboard pages + budget enforcement engine | Implemented | n/a |
| LiteLLM routing idea | Model routing | Own router (ADR-0009); providers: mock + any OpenAI-compatible endpoint (Ox Alpha/OpenAI/Ollama/vLLM) | Mock fully tested; real provider needs key at runtime | n/a |

## Runtime dependencies (verified against npm registry during install)

| Package | Version pin | Purpose | License |
|---|---|---|---|
| fastify | ^5 | HTTP API | MIT |
| zod | ^3 (or ^4 if resolved) | config/route validation | MIT |
| yaml | ^2 | workflow definitions | ISC |
| react / react-dom | ^18 | dashboard UI | MIT |
| vite / @vitejs/plugin-react | ^5/^4 | dashboard build | MIT |
| typescript / eslint / typescript-eslint / @types/node | ^5.9 / ^9 / ^8 / ^24 | toolchain | Apache-2.0/MIT |

Zero native modules required (SQLite via built-in `node:sqlite`). No transpile step for
services (ADR-0003). Full lockfile committed.

## Explicitly NOT integrated (and why)

- Anything requiring the Claude Code plugin system as a hard dependency.
- Any repo we could not verify exists/maintains a stable API from this environment.
- Duplicate orchestration engines, duplicate dashboards, duplicate databases (master prompt §100).
