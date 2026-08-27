# Production-Grade Upgrade Plan — Enterprise AI Agency OS (Dashboard & End-to-End)

> Review date: 2026-08-26 · Reviewer: enterprise full-stack assessment
> Scope: take the product from "functional internal console" → "international-grade, production-usable platform"

---

## 0. Project reality check (goal / target / focus / scale)

**Goal:** A self-hostable *AI Software Agency Operating System* — a control plane that orchestrates
autonomous engineering agents through the full SDLC (discovery → requirements → architecture →
implementation → review → security → QA → deployment → observability → knowledge) with human approval
gates, budgets, sandboxing and a tamper-evident audit trail.

**Target users:** (1) Platform/DevOps/SRE operators running the agency, (2) Engineering managers/PMs
steering deliveries, (3) the "Principal" approving high-risk actions, (4) auditors reviewing the
chain. Enterprise buyers expect SOC2/ISO posture, SSO, multi-tenant isolation, and a polished console.

**Scale target:** Multi-tenant SaaS *or* on-prem appliance. Horizontally scalable workers, Postgres
(not SQLite) in prod, OTel telemetry, SLA-backed deployments.

**Current stage:** A **strong, genuinely-working backend** (Fastify API, RBAC, approvals, rate
limiting, hash-chained audit, model router, orchestration, autonomous delivery pipeline) with
**112→118 passing tests**, clean lint/typecheck, Docker-hardened stack. The **dashboard is the weak
link**: it is functionally complete but visually basic, hand-rolled CSS, no design system, no charts,
no real-time polish, and several flows (create task, project detail, approvals history) are missing
from the UI even though the APIs exist.

**Verdict:** Backend is ~v0.10 (near production-hardening). Frontend is ~v0.3 (works, not
shippable). The fastest path to "production-grade + international-level UI" is a **frontend
foundation + design system + page rebuilds**, plus closing a small set of real functional gaps.

---

## 1. Problems found by actually running it (evidence)

| # | Problem | Evidence | Severity |
|---|---|---|---|
| P1 | **SSE live feed was broken** — `POST /api/v1/events/ticket` returned `400` when called without a JSON body (exactly how the dashboard calls it). Live "Mission Control" event stream silently dead. | Reproduced: `400 {"code":"VALIDATION_ERROR","message":"request body is not valid for content-type"}` | High (headline feature) |
| P2 | **API key stored in `localStorage` in plaintext** — any XSS exfiltrates the admin key. For a security-focused product this is a contradiction. | `api.ts: setApiKey → localStorage.setItem` | High (security) |
| P3 | **No task-create UI** — backend `POST /api/v1/tasks` exists, but the dashboard only has a Dispatch form (needs a pre-existing ready task). You cannot drive the SDLC from the UI. | No create-task form in `Tasks.tsx` | High (usability) |
| P4 | **No project detail view** — clicking a project does nothing; `GET /api/v1/projects/:id` exists but is unwired. | `Projects.tsx` has no link/detail | High (usability) |
| P5 | **No approvals history** — only pending approvals shown; no `approvals/history` endpoint. Auditors blind to past decisions. | grep: no history route | Medium |
| P6 | **DB pollution (local)** — 100+ `perf-*` projects from a load test persist in `agencyos.sqlite`. Not shipped (gitignored) but ruins first-run UX. | `data/agencyos.sqlite` | Low (dev only) |
| P7 | **No design system** — hand-rolled CSS vars, no tokens, no components, monochrome dark only. | `styles.css`, `ui.tsx` | High (UI/UX) |
| P8 | **No data viz** — spend, agent utilization, findings are plain tables; no charts/sparklines. | `Overview.tsx`, `Models.tsx` | Medium (UI/UX) |
| P9 | **No loading skeletons / error boundaries / toasts** — raw "Loading…" text, inline error strings, no retry affordance. | all pages | Medium (UX) |
| P10 | **Fragile data fetching** — custom `useApi` with no caching, no retries, no dedupe; Overview hacks `projects.items[0]` as firstProject. | `api.ts` | Medium |
| P11 | **No responsive shell polish** — sidebar collapses to a horizontal strip on mobile (ugly); no drawer. | `styles.css @media` | Medium |
| P12 | **No i18n scaffolding** — "international level" implies locale readiness. | none | Low/Medium |
| P13 | **No E2E/visual tests for the dashboard** — Playwright is a dep but unused; only backend tests run. | `package.json` scripts | Medium (quality) |
| P14 | **Notifications unread state not surfaced** — `GET /api/v1/notifications` exists, but no bell/panel in the shell. | no UI | Medium |

---

## 2. Parameters assessed

- **Functional completeness:** Backend 9/10, Frontend flows 5/10 (gaps P3–P5, P14).
- **UI/UX quality:** 3/10 (works, not designed). Needs design system, viz, motion, responsive, a11y.
- **Visual / brand:** 2/10 (no logo, no identity, single dark theme).
- **Security (frontend):** 4/10 (P2 API-key-in-localStorage is the critical one).
- **Accessibility:** 3/10 (minimal aria, no focus management, no keyboard nav, no ARIA live regions for the event feed).
- **Performance:** 6/10 (loads all tasks into DOM, no virtualization, no code-splitting).
- **Reliability/observability (frontend):** 2/10 (no error tracking, no web-vitals, no health checks).
- **Test coverage (frontend):** 1/10 (no component/E2E tests).
- **Production hardening:** 5/10 (no CSP, no SRI, no secure cookie, no Lighthouse gate).

---

## 3. Step list to production-grade + international-level UI/UX

> Ordered. Each step is detailed. "Build" = create/modify under `apps/dashboard`.

### Phase A — Foundations (must do first)
- **A1. Adopt a design system.** Install Tailwind CSS v3 + a token layer (`tailwind.config` with
  semantic colors, spacing, radius, shadows, typography, motion). Keep the existing dark base but add
  a real token vocabulary. *Why:* consistency + speed + international polish. Risk: low (additive).
- **A2. Build a component library** (`src/components/`): `Button` (variants/loading), `Card`/`Panel`,
  `Badge` (status tones), `StatCard` (with sparkline slot), `Table` (sortable, paginated, empty
  state), `Modal`/`Drawer`, `Toast` provider, `Tabs`, `Skeleton`, `EmptyState`, `Spinner`, `Input`/
  `Select`/`Textarea` with labels + error, `Avatar`, `Tooltip`, `ConfirmDialog`. *Why:* DRY + uniform UX.
- **A3. App shell redesign** (`App.tsx`): collapsible icon+label sidebar with active state and section
  grouping; top bar with global search ⌘K, notifications bell (unread count), user menu, theme toggle,
  environment badge. Responsive: sidebar → drawer on mobile. *Why:* first impression = product quality.
- **A4. Theming + a11y base.** Light/dark with `class` strategy, persisted; `prefers-reduced-motion`;
  focus-visible rings; color-contrast AA; `lang`, skip-link, landmark roles. *Why:* WCAG 2.1 AA is table
  stakes for enterprise.
- **A5. Replace `useApi` with TanStack Query** (`@tanstack/react-query`): caching, retries with
  backoff, dedupe, background refetch, mutation invalidation, error boundaries. *Why:* removes P10
  fragility and gives optimistic UI for free.
- **A6. Toast + ConfirmDialog + ErrorBoundary** globally. *Why:* P9 — every mutation should confirm
  (destructive) and report success/failure via toast, with retry on error.

### Phase B — Real-time & data viz
- **B1. Fix + wire SSE** (P1 done at API level; now consume `event`/`domain` frames in a
  `useEventStream` hook with `Last-Event-ID` resume, render a live feed with `aria-live`. Replace the
  5s polling on Delivery with SSE + fallback polling).
- **B2. Add charts** (`recharts`): Overview KPI sparklines + spend trend + agent utilization donut;
  Models page spend-by-model bar; Security severity breakdown. *Why:* P8.
- **B3. Notifications center** (P14): bell in topbar → popover list + "mark all read"
  (`POST /notifications/read-all`).

### Phase C — Core flow rebuilds (close P3–P5, P14)
- **C1. Projects:** list (virtualized) + create + **detail view** (P4) with tabs: Overview, Tasks,
  Deliveries, Knowledge, Security, Deployments, Audit. Each tab lazy-loaded.
- **C2. Tasks:** **create form** (P3: title, description, deps, priority, assignee) + board with
  status transitions + detail drawer + assign. Drive the full SDLC from UI.
- **C3. Approvals:** pending + **history** (add `GET /approvals/history` backend) + risk-diff viewer
  + bulk approve/reject + SLA timers.
- **C4. Delivery:** pipeline **stepper** using the existing `STAGE_LABELS`, live run timeline, self-heal
  log, artifact/receipt view.
- **C5. Agents / Models / Security / Knowledge / Audit / Settings / Deployments:** restyle with the
  new system + add the missing actions (e.g. Security "mitigate", Knowledge "create/verify", Settings
  API-key rotate/revoke UI).

### Phase D — Security & auth UX (P2 critical)
- **D1. Replace API-key-in-localStorage with a session.** Either (a) httpOnly secure cookie set by the
  control plane on login, or (b) keep key but store in memory + optional OS keychain, never localStorage.
  Add a proper login page (not the current raw input) with role display.
- **D2. CSP / SRI / secure headers** on the dashboard (nginx/vite config); never expose keys to JS
  where avoidable.

### Phase E — Production hardening & quality
- **E1. Build pipeline:** hashed assets, sourcemaps off in prod, `vite build` + `tsc` gate.
- **E2. E2E tests (Playwright):** critical paths (login → create project → create task → dispatch →
  approve → delivery run → audit verify). Visual regression on key screens.
- **E3. Lighthouse CI** gate (perf ≥90, a11y ≥90, SEO ≥80, best-practices ≥90).
- **E4. Error tracking (Sentry) + web-vitals** reporting.
- **E5. i18n scaffolding** (i18next, `en` default) so locales can be added without rework (P12).
- **E6. `npm run db:reset` + a clean demo seed** (3–5 realistic sample projects/tasks so first run is
  not empty and not polluted — P6).

### Phase F — Verify & sign-off
- **F1.** Full backend `npm test` + frontend typecheck + lint + E2E all green.
- **F2.** Lighthouse + a11y audit green; manual pass on light/dark + mobile.
- **F3.** Re-run production certification; update `PROGRESS.md`, `CHANGELOG.md`, and user docs.

---

## 4. What was executed this session

- ✅ **P1 fixed & verified:** `api.ts` now always sends `content-type: application/json` and an empty
  `{}` body for POSTs, so the SSE ticket exchange returns `201` and the stream emits correctly
  (verified: `STATUS=200`, `text/event-stream`, `event: hello` received).
- ✅ Documented the full gap analysis + ordered step plan above.
- ⏳ Foundation execution (Phase A) is the next concrete build step.

---

## 5. Recommended immediate next actions (highest leverage)

1. **A1+A2+A3+A4** — design system + component lib + shell + theming. (Unblocks everything; ~1–2 days.)
2. **D1** — kill the localStorage API-key anti-pattern. (Security blocker for enterprise.)
3. **C1+C2** — project detail + task create so the product is actually usable end-to-end.
4. **B2** — charts for the flagship Overview.
