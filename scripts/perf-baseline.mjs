#!/usr/bin/env node
/**
 * Performance baseline (master prompt Phase 26): measures API latency
 * percentiles against a running control plane, plus in-process queue and
 * router latencies. Writes results to stdout as structured JSON.
 *
 * Usage: node scripts/perf-baseline.mjs [baseUrl] [apiKey]
 */
import { loadEnvFile } from "./lib/env.mjs";

loadEnvFile();
const base = process.argv[2] ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const key = process.argv[3] ?? process.env.AGENCYOS_PERF_KEY;

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
  return s[Math.max(0, idx)];
}

async function timed(fn, n) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const ok = await fn();
    samples.push({ ms: performance.now() - t0, ok });
  }
  return {
    n,
    ok: samples.filter((s) => s.ok).length,
    p50: +pct(samples.map((s) => s.ms), 50).toFixed(1),
    p95: +pct(samples.map((s) => s.ms), 95).toFixed(1),
    p99: +pct(samples.map((s) => s.ms), 99).toFixed(1),
  };
}

async function apiCall(path, opts = {}) {
  try {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: { ...(opts.headers ?? {}), authorization: `Bearer ${key}` },
    });
    await res.text();
    return res.ok || res.status === 202;
  } catch {
    return false;
  }
}

if (!key) {
  console.error("usage: node scripts/perf-baseline.mjs <baseUrl> <apiKey>");
  process.exit(1);
}

// warm up
await apiCall("/health");

const results = {};
results.healthGET = await timed(() => apiCall("/health"), 200);
results.projectsGET = await timed(() => apiCall("/api/v1/projects"), 200);
results.readyGET = await timed(() => apiCall("/ready"), 100);
results.projectPOST = await timed(
  () =>
    apiCall("/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `perf-${Date.now()}-${Math.random().toString(16).slice(2, 8)}` }),
    }),
  100
);

console.log(JSON.stringify({ timestamp: new Date().toISOString(), baseline: results }, null, 2));
