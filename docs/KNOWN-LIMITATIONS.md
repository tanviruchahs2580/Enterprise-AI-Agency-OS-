# KNOWN LIMITATIONS

Honest ledger of what this system does NOT do today. Nothing here is hidden.

## Environment-blocked verifications

| Item | Blocker | What would verify it |
|---|---|---|
| Container image build/start/scan | No Docker daemon on build host | Any container-capable host running `docker compose up --build` |
| Kubernetes deployment | No cluster access | Helm chart (ROADMAP v0.2) + staging cluster |
| Live LLM provider end-to-end | Requires MODEL_PROVIDER_API_KEY at runtime | Same code path is CI-tested via deterministic mock provider |

## Functional scope boundaries (current design)

1. **Single-process workers** — job queue is DB-backed but worker loop runs
   in-proc; horizontal scaling needs the Postgres driver + external scheduler.
2. **In-memory SSE & rate limiting** — per-instance only; multi-replica needs
   Redis backplane (UPGRADE P2).
3. **Agent execution produces plans/artifacts, not autonomous repo edits yet** —
   the git-worktree edit loop is ROADMAP v0.2; dispatch pipeline, budgets,
   receipts and handoffs are fully live now.
4. **Browser automation disabled** — interface + feature flag exist; no verified
   provider on Windows without Docker (blueprint gstack reference not integrated).
5. **SIEM connectors** — security-findings API exists; Splunk/ELK ingestion
   adapters are future work.
6. **SQLite in local production simulations** — production profile refuses it;
   staging should use the Postgres profile.

## Documentation deltas

- WORKFLOWS.md describes stage-handler registration via engine API; YAML loader
  for custom definitions ships v0.2 (built-in definition is active now).
- SKILLS.md registry schema is contractual; file-based loader lands with it.

None of the above contradicts shipped behavior — each has a matching entry in
ROADMAP.md or UPGRADE-RECOMMENDATIONS.md.
