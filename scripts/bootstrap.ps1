#!/usr/bin/env pwsh
# Enterprise AI Agency OS — one-command bootstrap (Windows)
# Checks prerequisites, installs deps, prepares env, migrates, seeds, health-checks.
$ErrorActionPreference = "Stop"

function Info($m)  { Write-Host "[bootstrap] $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "[ok] $m" -ForegroundColor Green }
function Fail($m)  { Write-Host "[FAIL] $m" -ForegroundColor Red; exit 1 }

Info "checking prerequisites…"

# Node >= 24
$nodeOk = $false
try {
  $v = (& node --version) -replace '^v',''
  $major = [int]($v.Split('.')[0])
  if ($major -ge 24) { $nodeOk = $true }
} catch {}
if (-not $nodeOk) { Fail "Node.js >= 24 is required (https://nodejs.org)" }
Ok "Node $(node --version)"

# Git
try { $null = git --version } catch { Fail "git is required" }
Ok "git $(git --version)"

# .env
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Info "created .env from template — edit it to add provider keys"
}
Ok ".env present"

# dependencies
Info "installing dependencies…"
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Fail "npm ci failed" }
npm approve-scripts esbuild 2>$null | Out-Null
Ok "dependencies installed"

# migrations + seed
Info "applying database migrations…"
node scripts/migrate.mjs
if ($LASTEXITCODE -ne 0) { Fail "migration failed" }
Ok "database ready"

Info "seeding development data…"
node scripts/seed.mjs
if ($LASTEXITCODE -ne 0) { Fail "seed failed" }
Ok "seed complete"

# self test
Info "running environment self-test…"
node scripts/self-test.mjs

Write-Host ""
Write-Host "Bootstrap complete." -ForegroundColor Green
Write-Host "  start API:      npm run dev        (or: node apps/control-plane/src/server.ts)"
Write-Host "  dashboard dev:  npm run dev --workspace @agency/dashboard"
Write-Host "The admin API key is printed once when the server starts."
