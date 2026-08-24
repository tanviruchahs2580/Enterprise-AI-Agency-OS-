#!/usr/bin/env bash
# Enterprise AI Agency OS — one-command bootstrap (macOS / Linux)
set -euo pipefail

info() { printf "[bootstrap] %s\n" "$1"; }
ok()   { printf "\033[32m[ok] %s\033[0m\n" "$1"; }
fail() { printf "\033[31m[FAIL] %s\033[0m\n" "$1"; exit 1; }

info "checking prerequisites…"

command -v node >/dev/null 2>&1 || fail "Node.js >= 24 required (https://nodejs.org)"
NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
[ "$NODE_MAJOR" -ge 24 ] || fail "Node >= 24 required, found $(node --version)"
ok "Node $(node --version)"

command -v git >/dev/null 2>&1 || fail "git is required"
ok "git $(git --version)"

[ -f .env ] || cp .env.example .env
info "created .env from template — edit it to add provider keys"

info "installing dependencies…"
npm ci --no-audit --no-fund

info "applying database migrations…"
node scripts/migrate.mjs

info "seeding development data…"
node scripts/seed.mjs

info "running environment self-test…"
node scripts/self-test.mjs

printf "\n%s\n" "Bootstrap complete."
printf "  start API:      npm run dev\n"
printf "  dashboard dev:  npm run dev --workspace @agency/dashboard\n"
printf "The admin API key is printed once when the server starts.\n"
