#!/usr/bin/env node
/**
 * Environment self-test (master prompt §60): one command reporting the state
 * of every dependency the platform can use. Exit code 1 only when a REQUIRED
 * component is broken; optional components are reported as such.
 */
import { loadEnvFile } from "./lib/env.mjs";
import { loadConfig } from "../packages/core/src/index.ts";
import { openDatabase, migrate } from "../packages/db/src/index.ts";

loadEnvFile();

const results = [];
function record(name, required, ok, detail) {
  results.push({ name, required, ok, detail });
}

// configuration
let cfg = null;
try {
  cfg = loadConfig();
  record("config", true, true, `profile=${cfg.NODE_ENV}`);
} catch (e) {
  record("config", true, false, String(e).split("\n")[0]);
}

// database + migrations
if (cfg) {
  try {
    const driver = openDatabase(cfg.DATABASE_URL);
    migrate(driver);
    driver.get("SELECT 1 AS ok");
    driver.close();
    record("database", true, true, cfg.DATABASE_URL.startsWith("postgres") ? "postgres" : "sqlite");
    record("migrations", true, true, "schema up to date");
  } catch (e) {
    record("database", true, false, String(e).split("\n")[0]);
    record("migrations", true, false, "skipped (database unavailable)");
  }
} else {
  record("database", true, false, "skipped (config invalid)");
}

// model providers
try {
  const { MockModelProvider } = await import("../packages/models/src/index.ts");
  const mock = new MockModelProvider();
  const healthy = await mock.healthCheck();
  record("model:mock", true, healthy, "deterministic offline provider");
  if (process.env.MODEL_PROVIDER_API_KEY && process.env.MODEL_PROVIDER_BASE_URL) {
    record("model:real", false, true, `${process.env.MODEL_PROVIDER_BASE_URL}`);
  } else {
    record("model:real", false, false, "MODEL_PROVIDER_API_KEY/BASE_URL not set (optional)");
  }
} catch (e) {
  record("model:mock", true, false, String(e));
}

// git
import { execFileSync } from "node:child_process";
function probe(cmd, args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: "utf8", timeout: 8000 }).trim() };
  } catch {
    return { ok: false, out: "" };
  }
}
const git = probe("git", ["--version"]);
record("git", false, git.ok, git.out || "not installed");

// docker
const docker = probe("docker", ["version", "--format", "{{.Server.Version}}"]);
record(
  "docker",
  cfg?.SANDBOX_PROVIDER === "docker",
  docker.ok,
  docker.ok ? `server ${docker.out}` : "daemon unreachable (required only for docker sandbox/containers)"
);
if (cfg?.SANDBOX_PROVIDER === "docker" && !docker.ok && cfg?.NODE_ENV === "production") {
  // production must not boot with process sandbox — surface loudly here
  record("sandbox", true, false, "SANDBOX_PROVIDER=docker requires a reachable daemon in production");
} else {
  record("sandbox", false, true, cfg ? `provider=${cfg.SANDBOX_PROVIDER}` : "-");
}

// github
if (process.env.GITHUB_TOKEN) {
  record("github", false, true, "token configured");
} else {
  record("github", false, false, "GITHUB_TOKEN not set (optional)");
}

// observability endpoints (optional)
record(
  "observability",
  false,
  Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "OTLP endpoint not configured (optional)"
);

let failedRequired = 0;
for (const r of results) {
  const mark = r.ok ? "\x1b[32mPASS\x1b[0m" : r.required ? "\x1b[31mFAIL\x1b[0m" : "\x1b[33mWARN\x1b[0m";
  console.log(` ${mark}  ${r.name.padEnd(16)} ${r.detail}`);
  if (!r.ok && r.required) failedRequired++;
}
console.log("");
console.log(failedRequired === 0 ? "Self-test: system ready." : `Self-test: ${failedRequired} required component(s) failing.`);
process.exit(failedRequired === 0 ? 0 : 1);
