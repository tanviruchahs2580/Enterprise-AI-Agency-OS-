# SLOs & Incident SOP v1.0

| | |
|---|---|
| **Document** | `docs/sre/slo.md` + `incident-sop.md` |
| **Version** | v1.0 |
| **Owner** | SRE (sre), **Accountable: SRE (G6)** |

## 1. SLOs (from `nfr-register.md` + `srePostDeployCheck`)

| SLO | Target | Error budget |
|---|---|---|
| Availability | 99.9% | 0.1% (43m/month) |
| p95 latency (dashboard) | 500ms | burn rate alert |
| Error rate | 1% | via `agencyos_http_requests_total` |

## 2. Observability (Phase 7)

- **Tracing:** OpenTelemetry (`tracing.ts`), correlation IDs in structured JSON logs.
- **Metrics:** `agencyos_build_info`, `http_requests_total`, `model_requests_total`.
- **Dashboards:** RED/USE on golden signals; alerts → runbooks (`docs/runbooks/*`).

## 3. Incident SOP (ITIL-lite)

| Severity | Definition | Comms | Postmortem |
|---|---|---|---|
| **SEV1** | Prod down | Immediate, Principal paged | Blameless ≤48h → `postmortems/` + ticket `PROJ-###` |
| **SEV2** | Degraded | Within 1h | Same |
| **SEV3** | Minor | Next RAG | Logged |

## 4. DORA (monthly trend, from Phase 7)

Deployment frequency, lead time, MTTR, change failure rate — tracked in `docs/delivery/rag-*.md`.

## 5. Exit (G6)

Simulated incident e2e with postmortem — required before Done.

## Change log

- v1.0 — SLOs + incident SOP
