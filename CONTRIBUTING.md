# CONTRIBUTING.md

## Ground rules

1. **Security first (P0)**, then correctness, architecture, maintainability,
   performance. Never trade P0–P3 for convenience.
2. **No fake success.** Tests must verify real behavior; report BLOCKED when
   something cannot be verified in your environment.
3. **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`…).
4. Every stage of work updates `PROGRESS.md`; important decisions get an ADR
   in `docs/ARCHITECTURE-DECISIONS.md`.

## Development workflow

```sh
npm ci                 # install
npm run dev            # api + dashboard with watch
make test              # full suite (must pass before every PR)
make lint && make typecheck
```

## Definition of Done

- [ ] Typecheck + lint clean
- [ ] New behavior covered by tests that can fail (not mock-only)
- [ ] Docs updated (README/ADRs/API if affected)
- [ ] No secrets in code, tests or fixtures
- [ ] `PROGRESS.md` reflects reality

## Adding a subsystem

Follow the existing seams: implement a provider interface, register it behind a
feature flag if optional, add migrations as a NEW numbered SQL file (never edit
applied ones), and expose it through `/api/v1` with permission checks and audit
events.

## Code style

- TypeScript strict; explicit types on exports; no parameter properties
  (Node strip-types compatibility — see ADR-0003).
- Structured logs via `createLogger`; never `console.log` secrets.
- Errors: throw `AppError(code, message)` from `@agency/core`.
