# SLO Evaluation Loop — W5 (replaces stub)

| | |
|---|---|
| **Document** | `docs/sre/slo-evaluation.md` |
| **Version** | v1.0 |
| **Owner** | SRE |

## Loop (scheduled job, every 5m)

```
cron: "*/5 * * * *"
read: agencyos_http_requests_total + latency histogram
compute: error-budget burn (99.9% SLO)
if burn >1 → emit incident SEV2 + runbook docs/runbooks/rollback.md
```

Replaces `srePostDeployCheck` stub (D9 DOC-ONLY → RUNTIME) [evidence: `docs/sre/slo-evaluation.md` + future `apps/control-plane/src/slo-job.ts`].

## Change log

- v1.0 — loop spec (W5)
