# Scraper Implementation Report — Enterprise AI Agency OS → Scraping Agent

**Date:** 2026-08-28
**Scope:** Implement a fully functioning, orchestrator-integrated web scraper by executing the
roadmap core (crawl → fetch → render → extract → PII-redact → store) and wiring it into the
existing control-plane job queue, RBAC, audit, and observability fabric.

> The product is an **autonomous-agent control plane / orchestrator**, not a scraper by origin.
> We built the scraper as a first-class, deterministic capability *reusing* the orchestrator —
> it runs as a `scrape_task` job (same queue, retries, idempotency, audit/event bus as every
> other worker). The control-plane is **not** polluted with scraping logic.

---

## 1. What was built

### New package `@agency/scraper` (`packages/scraper/`)
A dependency-light, orchestrator-agnostic engine:

| Module | Responsibility |
|--------|----------------|
| `types.ts` | Public types: `ScraperConfig`, `ScrapeJobResult`, `ExtractedPage`, `ExtractRule`, `LlmExtractor`. |
| `robots.ts` | robots.txt fetch + parse (allow/disallow prefixes, crawl-delay, sitemap). Fail-open. |
| `fetcher.ts` | HTTP GET with rotating User-Agent pool, retries + exponential backoff, `Retry-After` honor, timeout, optional proxy (injected undici dispatcher). |
| `renderer.ts` | JS rendering via Playwright **with graceful static fallback** (mode `auto`/`static`/`js`). |
| `extract.ts` | CSS/attribute extraction (cheerio), meta/OpenGraph, JSON-LD, optional LLM extraction hook, link collection. |
| `pii.ts` | Pattern-based PII detection + redaction (EMAIL, PHONE, CREDIT_CARD, IPV4) on extracted values **and** full page text. |
| `crawler.ts` | BFS frontier: seeds → fetch → extract → redact → enqueue same-host links; robots-aware, per-host politeness delay, dedupe, depth/maxPages caps. |
| `store.ts` | Filesystem sink (`writeResultsToFile`, `toRecords`) for CLI/standalone use. |
| `agent.ts` | `SCRAPER_AGENT` contract (capabilities registry entry). |
| `index.ts` | `runScrapeJob(config, jobId?)` + `defaultConfig()` + re-exports. |

### Control-plane integration
- **Migration `0007_scrape_results.sql`** — `scrape_jobs` table (id, org_id, seed_url, config_json, status, result_json, error, timestamps) + index.
- **RBAC** (`packages/security/src/rbac.ts`) — new `scrape:create` / `scrape:read` permissions; `scrape:read` granted to all read roles (incl. VIEWER), `scrape:create` to engineering+ roles.
- **Worker** (`apps/control-plane/src/workers.ts`) — registers `scrape_task`: loads the `scrape_jobs` row, runs `runScrapeJob`, persists `result_json`, emits `ScrapeStarted`/`ScrapeFinished` events, idempotent + retry/DLQ via the existing queue.
- **Routes** (`apps/control-plane/src/app.ts`):
  - `POST /api/v1/scrape` (perm `scrape:create`) → validates URL, stores config, enqueues `scrape_task` → `202 { jobId, status }`.
  - `GET /api/v1/scrape` (perm `scrape:read`) → list org jobs.
  - `GET /api/v1/scrape/:id` → job + parsed result/error.
- **Workspace** — `@agency/scraper` added to root `tsconfig.json` references and control-plane `package.json` deps.

## 2. How to use (API)

```bash
# Submit a crawl (depth 1, same-host link following, CSS extraction, PII redaction)
curl -X POST http://localhost:3939/api/v1/scrape \
  -H "authorization: Bearer $ADMIN_KEY" -H "content-type: application/json" \
  -d '{"url":"https://example.com/start","depth":1,"extract":"css",
       "rules":[{"name":"title","selector":"h1"}],"redactPii":true}'

# Fetch the result
curl http://localhost:3939/api/v1/scrape/<jobId> -H "authorization: Bearer $ADMIN_KEY"
```

Programmatic: `import { runScrapeJob, defaultConfig } from "@agency/scraper"`.

## 3. Verification

- **Unit/integration tests** (`packages/scraper/test/scraper.test.ts`): robots disallow, CSS/attribute extraction, PII redaction (incl. arrays), and **two real end-to-end crawls against a local HTTP server** (link-following + robots enforcement). 6/6 pass.
- **Full suite** (`npm test`): **126/126 pass** (prior 120 + 6 new).
- **Typecheck** (`npm run typecheck`): clean.
- **Lint** (`npm run lint`): clean.
- **Live API smoke** (real control-plane boot + target server):
  - `POST /api/v1/scrape` → `202 {jobId}` → worker ran → `GET` returned `status: succeeded`.
  - Crawled 2 pages (seed + discovered link, depth 1), extracted `h1` titles, flagged `EMAIL` PII, persisted result to `scrape_jobs`.

## 4. Roadmap status

Executed into the product (working + tested):
- ✅ Phase 0 — crawl frontier, robots.txt respect, politeness, dedupe, depth/maxPages caps.
- ✅ Fetch: UA rotation, retries/backoff, Retry-After, timeout, proxy pluggable.
- ✅ Render: static + JS (Playwright) with auto-fallback.
- ✅ Extract: CSS, attribute, meta/OG, JSON-LD; LLM hook for `extract:"llm"`.
- ✅ PII detect + redact (fields + page text).
- ✅ Store: DB persistence via orchestrator job + filesystem sink.
- ✅ Orchestrator reuse: job queue, RBAC, audit, event bus, idempotency, DLQ.

Documented as remaining (enterprise scale — multi-quarter, intentionally out of this session):
- **Browser fleet / scaling** — single headless browser today; needs a pooled, autoscaled renderer farm (e.g. via the orchestrator's worker pool / Kubernetes).
- **Anti-bot resistance** — beyond UA rotation: CAPTCHA solving, fingerprint evasion, residential/mobile proxy pools, request shaping.
- **OCR** — scanned-PDF/image text extraction (tesseract/cloud OCR) not yet implemented.
- **Kafka / stream scale-out** — `scrape_task` runs in-process; for high volume, move to a distributed stream (Kafka/NATS) + sharded frontier.
- **Multi-tenant RLS** — `scrape_jobs` is org-scoped (enforced by route `org_id` filter); add DB row-level security policies for stricter isolation.
- **SSO / OIDC** — API-key auth today; OIDC seam (`IdentityProvider`) exists but is unscaffolded for scraping.
- **OpenTelemetry** — scraper emits bus events; wire structured traces/metrics (Otel exporter) for crawl health.
- **Eval / quality gates** — add extraction-accuracy eval harness + regression suite.
- **Dashboard UI** — scrape jobs are API-only; a UI panel (submit job, view results) is a thin addition on the existing React dashboard.

## 5. Extension points (already wired)
- **Proxy:** pass `proxyUrl` (resolves to undici `ProxyAgent`) or `proxyDispatcher` (pre-built) per job/request.
- **LLM extraction:** set `extract:"llm"` + `llmExtract(html,url)=>Record` (plugs into the existing model router for paid tiers).
- **Sinks:** `store.ts` is the seam for Parquet/S3/Kafka sinks.
