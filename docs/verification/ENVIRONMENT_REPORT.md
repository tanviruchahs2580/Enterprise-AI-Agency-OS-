# Environment Report — Enterprise AI Agency OS

> Generated during final production verification. The repository under test is
> **Enterprise AI Agency OS** (an AI-agent control plane / orchestrator), NOT a
> web-scraping agent. The "Enterprise AI Scraping Agent" master prompt's
> crawler/browser/OCR/SSRF-to-metadata requirements are architecturally N/A and
> are mapped as such in `REQUIREMENT_TRACEABILITY.md`.

## Host
- OS: Windows 11 / win32 (verification host)
- Shell: PowerShell 5.1
- CPU/RAM/Disk: sufficient (Node cold-start + docker desktop available)
- Date: 2026-08-28

## Toolchain (verified present)
- Node.js: v24.19.0
- npm: 11.17.x
- Git: 2.55.x
- GitHub CLI: 2.98.x (authenticated as `tanviruchahs2580`)
- Docker: 29.7.2 (daemon running; non-root image build verified in prior turn)

## Runtime / services
- Database: Node 24 built-in `node:sqlite` (dev, WAL mode) / PostgreSQL (prod profile)
- Redis: not required — queue is in-process with idempotency + restart recovery
- Browser: N/A (no scraping engine in this product)
- External LLM: optional — `MODEL_PROVIDER_API_KEY` unset ⇒ deterministic mock router
- GitHub: optional — `GITHUB_TOKEN` unset ⇒ integrations adapter inert

## Clean install result (§9 / §10 / §64)
Performed from a **fresh `git clone --local`** of `fa6009e` (v0.15.0):
```
clone  → OK
npm ci → 356 packages, 33s, 0 vulnerabilities (npm audit --omit=dev)
migrate→ 6 migrations applied (43+ tables)
build  → dashboard Vite build OK (34s)
boot   → /health 200
task   → project→task→ready→execution→succeeded, task→in_progress, jobs{succeeded:1}
```
**Verdict: clean install + real end-to-end run PASS.**

## Environment variables observed
- `ADMIN_BOOTSTRAP_KEY` (owner bootstrap), `DATABASE_URL` (default `./data/agencyos.sqlite`)
- `RATE_LIMIT_MAX` (default 600), `RATE_LIMIT_WINDOW_MS` (60000), `RATE_LIMIT_STORE` (memory|postgres)
- `NODE_ENV`, `PORT`, `HOST`, `SANDBOX_PROVIDER`, `MODEL_PROVIDER_API_KEY`, `GITHUB_TOKEN`, `STRICT_SECRET_BACKEND`
- Production config validation REQUIRES `postgres://` `DATABASE_URL` and forbids `*` CORS / plain-env secrets.

## Known environmental artifact (NOT a product defect)
A zero-byte marker file named `UsersDSTAppDataLocalTemp…agencyos.sqlite` is
created in the working directory by **any** `node` invocation (even `node -e "1"`),
independent of the application code (proven: the stray appears with a trivial
node command and with `NODE_OPTIONS` cleared). This is a node-launcher / shell-hook
behavior in this Windows environment. It does not affect functionality, data
integrity, or the real `data/agencyos.sqlite` database. Recommendation: investigate
the node wrapper / profile in the CI runner; the product itself opens the DB safely.
