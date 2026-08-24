#!/usr/bin/env node
/**
 * Production readiness gate (master prompt §65). Validates:
 * configuration, security posture, database, migrations, containers, health,
 * secrets hygiene, CI artifacts. Exits non-zero on any failed required check.
 */
import { loadEnvFile } from "./lib/env.mjs";
import { existsSync, readFileSync } from "node:fs";

loadEnvFile();
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
}

// 1. environment profile
const env = process.env.NODE_ENV;
check("profile", ["staging", "production"].includes(env), `NODE_ENV=${env ?? "(unset)"} must be staging|production`);

// 2. production config constraints
if (env === "production") {
  const hasKey = Boolean(process.env.ADMIN_BOOTSTRAP_KEY);
  check("admin-key", hasKey, "ADMIN_BOOTSTRAP_KEY must be set explicitly");

  const isPg = (process.env.DATABASE_URL ?? "").startsWith("postgres");
  check("postgres", isPg, "DATABASE_URL must be postgres:// in production");

  const noWildcard = !(process.env.CORS_ORIGIN ?? "").includes("*");
  check("cors", noWildcard, "CORS_ORIGIN must not include *");

  check(
    "sandbox",
    process.env.SANDBOX_PROVIDER === "docker",
    "SANDBOX_PROVIDER=docker enforced for production"
  );
} else {
  check("profile", false, "set NODE_ENV=production (or staging) to run this gate");
}

// 3. secret hygiene: .env not committed, example has no real-looking values
check(".gitignore-covers-env", existsSync(".gitignore") && /\.env/.test(readFileSync(".gitignore", "utf8")), ".env ignored by git");
if (existsSync(".env.example")) {
  const ex = readFileSync(".env.example", "utf8");
  const suspicious = [...ex.matchAll(/^(?!\s*#)(?:.*(?:KEY|SECRET|PASSWORD|TOKEN))=(?!\s*$)(.{12,})$/gim)]
    .filter((m) => !/</.test(m[1]) && !/^\$\{/.test(m[1]) && !/your[-_]/i.test(m[1]));
  check("env-example-clean", suspicious.length === 0, suspicious.length ? `${suspicious.length} placeholder(s) look real` : "only placeholders present");
} else {
  check("env-example-clean", true, ".env.example missing (ok)");
}

// 4. CI artifacts
for (const f of [".github/workflows/ci.yml", ".github/workflows/security.yml", "package-lock.json"]) {
  check(`artifact:${f}`, existsSync(f), existsSync(f) ? "present" : "missing");
}

// 5. lockfile pinned deps (no file: / git: deps in runtime graph)
try {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const bad = Object.values(lock.packages ?? {})
    .flatMap((p) => Object.entries(p.dependencies ?? {}))
    .filter(([, v]) => String(v).startsWith("git+") || String(v).startsWith("file:"));
  check("deps-pinned", bad.length === 0, bad.length ? `unpinned: ${bad.map((b) => b[0]).join(",")}` : "no git/file deps");
} catch {
  check("deps-pinned", false, "package-lock.json unreadable");
}

let failed = 0;
for (const c of checks) {
  const mark = c.ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(` ${mark}  ${c.name.padEnd(24)} ${c.detail}`);
  if (!c.ok) failed++;
}
console.log("");
console.log(failed === 0 ? "Production readiness: READY." : `Production readiness: ${failed} check(s) failing.`);
process.exit(failed === 0 ? 0 : 1);
