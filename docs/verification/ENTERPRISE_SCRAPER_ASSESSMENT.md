# Enterprise Scraper Assessment & Roadmap — Enterprise AI Agency OS

> Author lens: senior staff / top-500 full-stack engineer reviewing the repo as the
> foundation for an **international, enterprise-grade web-scraping platform**.
> Date: 2026-08-28. Evidence: docs/verification/*, live API run, `workflow-monitor.mjs`,
> source walk of `apps/control-plane`, `packages/*`.

---

## 0. Honest scope clarification (read first)

The codebase is **NOT a scraper**. It is an *autonomous AI Agency control plane / orchestrator*
(agents, tasks, executions, approvals, cost/budget, delivery gates, audit). The attached
master prompts described a "Scraping Agent", but the implementation contains **zero scraping
primitives**: no crawler, browser engine, proxy pool, parser/extractor, robots.txt handling,
or schema extraction.

So the correct engineering statement is:

> This repo is an excellent **control plane to ORCHESTRATE scraping agents**, but today it
> has no scraping *capability*. To become an "international enterprise-level scraper" you
> must (a) keep this orchestrator and (b) add a dedicated scraping execution layer + the
> enterprise scraping feature matrix below. Building a scraper *inside* the control plane
> would violate the existing architecture (see GAP_ANALYSIS.md "intentional non-goals").

Everything in §1–§3 is what is genuinely strong/weak *as observed*. §4–§8 is the enterprise
scraper feature catalog you asked for, with a build/extend recommendation per item.

---

## 1. Previous report review (docs/verification/*)

Strengths of the existing validation:
- FINAL_ENTERPRISE_VALIDATION_REPORT: evidence-based, 120/120 tests, live 24 API checks,
  Postgres persistence rehearsal, hardened Docker, 0 npm-audit vulns. Verdict: *production
  ready with documented limitations* — credible.
- GAP_ANALYSIS: correctly scopes out scraper features and lists real gaps (SSO/MFA, real
  delivery wiring, Otel/Grafana, multi-tenant RLS, i18n).

Gaps in the *reports themselves* (reviewer notes):
- No performance envelope beyond p50≈15ms on a single `/health` — no concurrency/throughput,
  no crawl-scale load test, no per-domain ban-rate telemetry.
- "Production ready" is for the *orchestrator*, not for a scraper (no scraping SLOs exist).
- Version drift (package.json 0.10.0 vs tags v0.16.0) still open (D1).

---

## 2. Current product condition (observed this session)

What is already enterprise-grade and directly *reusable* by a scraper platform:
| Capability | Status | Reuse for scraper |
|---|---|---|
| API-key auth + RBAC (11 roles, VIEWER read-only) | verified | tenant/operator auth ✓ |
| Revocable/rotatable keys, 401 on bad/revoked | verified | credential lifecycle ✓ |
| Rate limiting (429 + `Retry-After`) | verified | per-operator throttle ✓ |
| Append-only, hash-chained audit log | verified | compliance/forensics ✓ |
| Job queue: idempotent / retry / DLQ / restart-recovery | unit-verified | crawl job durability ✓ |
| Cost + budget governance (`/costs/summary`, daily $25 cap) | verified live ($0.000162) | **per-record scrape cost** ✓ |
| Approval gates (single-use/expiry) | verified | risky-target approvals ✓ |
| Prometheus `/metrics`, structured JSON logs, requestId | verified | scrape observability ✓ |
| Hardened Docker (non-root, cap_drop, RO rootfs) | verified | safe browser sandbox base ✓ |
| CI: lint/type/test/build/docker/Trivy/gitleaks/SBOM + Playwright e2e | all green now | supply-chain ✓ |
| Knowledge provenance + search | present | store extracted data lineage ✓ |

What is weak / missing for a scraper (observed + from code):
- `execute_task` ran via a **deterministic mock model**; no real LLM/extractor wired (D5).
- Autonomous `delivery/runs` did **not** auto-trigger from a task execution (needs
  MODEL_PROVIDER_API_KEY + docker sandbox + git). Delivery is a separate, ungated path.
- `http.origin_blocked` fired on every SSE `/events/ticket` call with no `Origin` header —
  CORS/origin policy exists but is strict/undocumented for API clients.
- No browser engine, proxy, parser, robots.txt, scheduling, or extraction anywhere.
- No multi-tenant isolation (single org scaffold; no Postgres RLS).
- Observability has no per-domain/per-proxy/ban-rate/business metrics.

---

## 3. Empirical run — one task through the workflow (what I observed)

Script: create project → create task → dispatch execution → poll → cost/audit snapshot.
Result (control-plane `ADMIN_BOOTSTRAP_KEY=demo-key`, mock model):

```
project: 201   prj_15c6138bf0df89a7d3227c0b
task:    201   tsk_01a04897-…            (status unset until transition)
agents:  21 returned, picked agt_01a046d9-…
dispatch: 202  executionId exe_f8564754…  status=queued
poll t=0s: exec=queued   jobs={"pending":1}
poll t=1s: exec=succeeded jobs={"succeeded":1}
costs:  allTimeByScope {org:0.000162, project:0.000081, task:0.000081}
        byModel [{selected_model:"mock-reasoning", total:0.000081, calls:1}]
        budgets [{daily $25, action block}]
audit:   project.created → task.created → execution.dispatched (actor apikey:bootstrap-admin)
delivery runs: 0   (autonomous delivery NOT triggered by execution)
```

`workflow-monitor.mjs` result: **14/16 passed, 2 advisory**, "Pipeline healthy".
Advisories: destructive-op reference in `orchestration/src/agents.ts`; dynamic-exec pattern
in `delivery/src/gates.ts` (both flagged for review, non-blocking).

**Interpretation (top-500 eng view):**
- The orchestration core is solid and the governance loop is real (cost + audit + budget
  engaged on a single job in <1s). This is a trustworthy backbone.
- But the "workflow" stops at *execution dispatch*. There is no scraping stage, no data
  extraction, no delivery, and the model is a mock. As a *scraper*, nothing actually
  scrapes. The lifecycle you would monitor for a scraper (enqueue → fetch → render →
  extract → validate → store → deliver) is entirely absent.

---

## 4. Enterprise-grade scraper — required feature/parameter catalog

Below is the full parameter/feature matrix an international enterprise scraper must have.
For each, I note CURRENT (does the orchestrator provide it) and ACTION (build/extend).

### 4.1 Crawl & ingestion
| # | Feature / Parameter | Current | Action |
|---|---|---|---|
| C1 | URL frontier + priority queue (per-domain, weighted) | queue exists (generic) | add crawl frontier w/ domain sharding |
| C2 | Robots.txt + crawl-delay + allow/deny compliance | none | **build** (legal must) |
| C3 | Sitemap.xml + RSS/Atom discovery | none | build |
| C4 | Depth/seed controls, max-pages, max-depth, TTL | none | build |
| C5 | JS/SPA rendering (headless Chromium fleet, Playwright) | none | **build** (browser pool on Docker/k8s) |
| C6 | Infinite scroll / lazy-load / click-to-expand handlers | none | build (browser scripts) |
| C7 | Incremental / change-detection crawls (hash/ETag/diff) | none | build |
| C8 | Recurring schedules (cron, per-source frequency) | none | add scheduler service |
| C9 | File/asset fetch (PDF, CSV, images, JSON, XML) | none | build media pipeline |

### 4.2 Anti-bot & resilience
| # | Feature / Parameter | Current | Action |
|---|---|---|---|
| A1 | Rotating proxy pool (residential / ISP / datacenter) | none | **build** (proxy broker + metrics) |
| A2 | Per-domain proxy assignment + ban auto-rotate | none | build |
| A3 | User-Agent + header-order + TLS/JA3 fingerprint rotation | none | build |
| A4 | Cookie jars / session reuse per domain | none | build |
| A5 | CAPTCHA solving (2captcha, AWS Captcha, hCaptcha) | none | integrate 3rd-party |
| A6 | Human-like pacing (jittered delays, mouse/scroll) | none | build (browser CDP) |
| A7 | Request signing / header spoof hardening | none | build |
| A8 | Ban detection (status/pattern) → auto-pause + alert | none | build (per-domain SLO) |
| A9 | Stealth plugins (CDP stealth, navigator spoof) | none | build/integrate |

### 4.3 Extraction & parsing
| # | Feature / Parameter | Current | Action |
|---|---|---|---|
| E1 | HTML parser (CSS/XPath selectors, cheerio) | none | build |
| E2 | Structured extraction (JSON-LD, microdata, OpenGraph) | none | build |
| E3 | LLM/AI extraction (few-shot, schema-constrained) | mock only | wire real model + JSON-schema output |
| E4 | Table / list / pagination extraction | none | build |
| E5 | OCR for PDF/images (Tesseract/AWS Textract) | none | integrate |
| E6 | Entity extraction / NER + classification | none | build/LLM |
| E7 | Translate / language detect | none | integrate |
| E8 | Schema validation + auto-mapping | none | build (JSON-schema) |
| E9 | Dedupe + entity resolution + normalization | none | build |

### 4.4 Data pipeline & storage
| # | Feature / Parameter | Current | Action |
|---|---|---|---|
| D1 | Validation/dropped-record quality scoring | none | build |
| D2 | PII detection + redaction before store | none | **build** (compliance) |
| D3 | Sink connectors: S3, GCS, BigQuery, Snowflake, Kafka | none | build |
| D4 | Export formats: ndjson, parquet, CSV | none | build |
| D5 | Incremental load / CDC / delta | none | build |
| D6 | Data residency / region pinning | none | add (multi-region) |
| D7 | Replay / reprocess from raw store | none | build |

### 4.5 Scale & infrastructure
| # | Feature / Parameter | Current | Action |
|---|---|---|---|
| S1 | Distributed workers (horiz. scale, k8s/HPA) | single-process jobs | extend to worker pool |
| S2 | Streaming backbone (Kafka/Redpanda/Pulsar) | in-memory queue | add broker |
| S3 | Per-domain concurrency limits + backpressure | none | build |
| S4 | Geo-distributed egress (region pinning) | none | build |
| S5 | Autoscaling browser pool | none | build (k8s) |
| S6 | Quotas per tenant/domain | budget exists | extend to domain quotas |

### 4.6 Security & compliance (international)
| # | Feature / Parameter | Current | Action |
|---|---|---|---|
| X1 | SSRF protection + egress allowlist | none (N/A today) | **build** (scraper egress) |
| X2 | Secrets manager (Vault/ASM), no plaintext | key hashing ok | add secret store |
| X3 | ToS / legal-risk review per target | approvals exist | add target-risk gate |
| X4 | GDPR/CCPA: PII handling, erasure, audit | audit log ok | add DSR workflow |
| X5 | Data-residency + regional isolation | none | build |
| X6 | Multi-tenant row-level security (Postgres RLS) | none | **build** |
| X7 | Consent / lawful-basis tagging | none | build |

### 4.7 Observability & SLOs (scraper-specific)
| # | Feature / Parameter | Current | Action |
|---|---|---|---|
| O1 | Per-domain success/fail/ban rate | none | build metrics |
| O2 | Proxy health + cost-per-record | none (cost exists) | extend per-record |
| O3 | Extraction accuracy / schema-drift alerts | none | build eval |
| O4 | Distributed tracing (OpenTelemetry) | none | **build** |
| O5 | Grafana dashboards + alerting | unused profile | wire |
| O6 | Replay/debug of a fetched page | none | build |

### 4.8 API, UX & governance
| # | Feature / Parameter | Current | Action |
|---|---|---|---|
| U1 | REST/GraphQL scrape-job API + webhooks | API exists (generic) | add scrape endpoints |
| U2 | Live job monitor UI (the dashboard) | dashboard exists | add scrape views |
| U3 | Cost/ban dashboards per source | dashboard exists | extend |
| U4 | Approval for risky targets | approvals exist | wire to target risk |
| U5 | SSO/MFA/sessions (human users) | API keys only | **build** (ADR-0007 seam) |
| U6 | i18n (Bangla + English) | English only | add i18n |
| U7 | Tenant isolation in UI | single org | add |

### 4.9 Quality / testing
| # | Feature / Parameter | Current | Action |
|---|---|---|---|
| Q1 | Golden-dataset extraction accuracy eval | none | build |
| Q2 | Selector self-healing / anomaly detect | none | build (LLM) |
| Q3 | Canary + replay tests | none | build |
| Q4 | Load/ban-rate test harness at crawl scale | none | build |

---

## 5. Gap matrix (current → enterprise)

PRESENT and directly reusable: auth/RBAC/keys, audit, queue(idempotency/retry/DLQ),
cost/budget, approvals, Prometheus/logs, hardened Docker, CI/CD, knowledge store.
PARTIAL: observability (no traces/scraper SLOs), delivery (separate/ungated), governance
monitor (advisory gaps).
ABSENT (must build): every item in §4.1–§4.4, §4.6 X1/X4–X6, §4.7 O1–O4, §4.8 U5–U7,
§4.9 — i.e. **the entire scraping surface**. This is expected: it was never a scraper.

---

## 6. Recommended architecture (keep orchestrator + add scraping layer)

```
┌──────────────────────────── Control Plane (EXISTING, reuse) ─────────────────────────┐
│  auth/RBAC │ audit │ cost/budget │ approvals │ job queue │ knowledge │ dashboard/API    │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │  dispatch "scrape" task
                        ┌────────────────▼─────────────────┐
                        │  Scraping Agent (NEW capability)  │
                        │  - crawl frontier (C1–C4,C7,C8)   │
                        │  - browser pool (C5,C6) Kubernetes │
                        │  - proxy broker (A1–A4)           │
                        │  - anti-bot/stealth (A5–A9)       │
                        │  - extractor (E1–E9)              │
                        │  - PII redact (D2,X4)             │
                        │  - sinks (D3–D5)                  │
                        │  - SSRF egress allowlist (X1)     │
                        └───────────────────────────────────┘
              metrics (O1–O3) → Prometheus → Grafana; traces (O4) → Otel
```

The orchestrator's `execution.dispatched` → `execute_task` job is the natural hook: a new
`scrape_task` job type calls the scraping-agent service. Cost/budget already tracks per-task
spend — extend tags to `domain` and `proxy` for per-record cost.

---

## 7. Phased roadmap

- **Phase 0 (weeks 0–2):** wrap the truth — document that this is an orchestrator; add a
  `scraper` agent contract + `scrape_task` job. Stand up browser pool + proxy broker PoC.
- **Phase 1 (2–6):** C1–C4, C5/C6 (Playwright fleet on k8s), E1–E3, D1/D3, X1 SSRF.
  Live scrape of 1–2 sources end-to-end through the orchestrator.
- **Phase 2 (6–10):** A1–A9 anti-bot, E4–E9 extraction/OCR/LLM, D2 PII, O1–O4 telemetry,
  U5 SSO (ADR-0007).
- **Phase 3 (10–14):** S1–S6 scale (Kafka, HPA, geo), X3/X4/X5/X6 compliance + RLS,
  U6 i18n, U7 tenant UI, Q1–Q4 eval/self-heal.
- **Phase 4:** international legal review per target jurisdiction; pen-test; chaos/ban test.

---

## 8. Risks & legal (international)

- Scraping legality varies by jurisdiction (CFAA/US, GDPR/EU, HiQ v. LinkedIn precedent,
  regional ToS). Requires per-target legal review gate (X3) + DSR (X4) + data residency.
- Proxy/residential use has contractual + legal exposure; ban-rotation must respect ToS.
- SSRF is a new attack surface once the platform makes outbound fetches (X1 mandatory).
- Cost runaway risk at crawl scale → extend budget to per-domain + hard circuit breaker.

---

## 9. Final verdict (top-500 engineer)

The repo is a **strong, production-grade orchestration control plane** (auth, RBAC, audit,
durable queue, cost governance, hardened CI/CD) — proven green this session including a live
task run and a healthy workflow monitor. It is, however, **not a scraper and contains none of
the scraping feature matrix in §4**. To deliver an *international enterprise-level scraper*,
treat this as the orchestration backbone and build the scraping layer (§4.1–§4.9) as a new
agent capability + infrastructure, reusing cost/audit/RBAC/queue. Estimated effort to a
credible enterprise MVP: ~3–4 engineering quarters across crawl, anti-bot, extraction,
compliance, scale, and observability workstreams. Do **not** bolt scraping into the control
plane itself — that would break the documented architecture.
