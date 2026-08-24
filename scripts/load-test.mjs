#!/usr/bin/env node
/**
 * Progressive load test (master prompt §21): ramps concurrency against a live
 * control plane and reports throughput/latency/error-rate per stage.
 *
 * Usage: node scripts/load-test.mjs <baseUrl> <apiKey> [maxConcurrency]
 */
import { loadEnvFile } from "./lib/env.mjs";

loadEnvFile();
const base = process.argv[2] ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const key = process.argv[3] ?? process.env.AGENCYOS_PERF_KEY;
const maxConc = Number(process.argv[4] ?? 100);

if (!key) {
  console.error("usage: node scripts/load-test.mjs <baseUrl> <apiKey> [maxConcurrency]");
  process.exit(1);
}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}

async function burst(concurrency, requestsPerWorker) {
  const latencies = [];
  let errors = 0;
  let rateLimited = 0;
  let completed = 0;
  const t0 = Date.now();

  async function worker() {
    for (let i = 0; i < requestsPerWorker; i++) {
      const s = performance.now();
      try {
        const res = await fetch(`${base}/api/v1/projects`, {
          headers: { authorization: `Bearer ${key}` },
        });
        await res.text();
        if (res.status === 429) rateLimited++;      // backpressure working as designed
        else if (!res.ok) errors++;
      } catch {
        errors++;
      }
      latencies.push(performance.now() - s);
      completed++;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const wall = (Date.now() - t0) / 1000;
  return {
    concurrency,
    totalRequests: completed,
    errors,
    rateLimited,
    errorRatePct: +((errors / completed) * 100).toFixed(3),
    rps: +(completed / wall).toFixed(1),
    p50: +pct(latencies, 50).toFixed(1),
    p95: +pct(latencies, 95).toFixed(1),
    p99: +pct(latencies, 99).toFixed(1),
    wallSeconds: +wall.toFixed(2),
  };
}

const stages = [10, 50, 100, 250, 500, 1000].filter((c) => c <= Math.max(maxConc, 10));
const results = [];
console.log(JSON.stringify({ event: "load_test_start", base, stages }));
for (const c of stages) {
  const r = await burst(c, Math.max(4, Math.ceil(200 / c)));
  results.push(r);
  console.log(JSON.stringify(r));
}
const allOk = results.every((r) => r.errorRatePct < 1 && r.p95 < 200);
console.log(JSON.stringify({
  event: "load_test_complete",
  verdict: allOk ? "PASS (error rate <1%, p95 <200ms at every stage)" : "INVESTIGATE",
  note: "HTTP 429 responses are reported separately as rateLimited — the default " +
        "600 req/min/key limiter is a designed backpressure control, not an error.",
  results,
}, null, 2));
