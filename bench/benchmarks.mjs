/**
 * Micro-benchmark scaffold (audit Phase 4, performance-engineer):
 * no dependencies, runs in Node 24, writes a JSON baseline to bench/results.json
 * and prints a human-readable table.
 *
 * Run: npm run bench
 */
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, encryptEnvelope, decryptEnvelope } from "@agency/core";
import { SqliteDriver, migrate, Db, genId } from "@agency/db";
import { WorkflowEngine } from "@agency/orchestration";
import { AuditLog } from "@agency/security";

const here = dirname(fileURLToPath(import.meta.url));

function bench(name, iterations, fn) {
  for (let i = 0; i < Math.min(iterations, 500); i++) fn(); // warmup
  const samples = [];
  for (let pass = 0; pass < 3; pass++) {
    const t0 = performance.now();
    for (let k = 0; k < iterations; k++) fn();
    samples.push((performance.now() - t0) / iterations);
  }
  samples.sort((a, b) => a - b);
  const medianMs = samples[Math.floor(samples.length / 2)];
  return {
    name,
    iterations,
    medianMs: Math.round(medianMs * 1e4) / 1e4,
    opsPerSec: Math.round(1 / medianMs),
  };
}

async function benchAsync(name, iterations, fn) {
  for (let i = 0; i < Math.min(iterations, 500); i++) await fn(); // warmup
  const samples = [];
  for (let pass = 0; pass < 3; pass++) {
    const t0 = performance.now();
    for (let k = 0; k < iterations; k++) await fn();
    samples.push((performance.now() - t0) / iterations);
  }
  samples.sort((a, b) => a - b);
  const medianMs = samples[Math.floor(samples.length / 2)];
  return {
    name,
    iterations,
    medianMs: Math.round(medianMs * 1e4) / 1e4,
    opsPerSec: Math.round(1 / medianMs),
  };
}

// ---- shared fixtures ----
const d = new SqliteDriver(":memory:");
const db = new Db(d);
migrate(d);
const orgId = genId("org");
const now = db.now();
db.insert("organizations", { id: orgId, name: "bench", slug: "bench", created_at: now, updated_at: now });

const engine = new WorkflowEngine(db);
engine.registerHandler("t", "alpha", async () => ({ a: 1 }));
engine.registerHandler("t", "omega", async () => ({ z: 1 }));
const stage1 = { name: "t", stages: [{ name: "alpha" }, { name: "omega" }] };
let runId = "";

const audit = new AuditLog(db);
let seq = 0;

const masterKey = Buffer.alloc(32, 9);
let envelopeToken = "";

const results = [
  bench("config.loadConfig", 4000, () => {
    loadConfig({ NODE_ENV: "local", DATABASE_URL: ":memory:" });
  }),
  bench("envelope.encrypt+decrypt", 30000, () => {
    envelopeToken = encryptEnvelope(masterKey, "sensitive payload");
    decryptEnvelope(masterKey, envelopeToken);
  }),
  bench("workflow.start", 2000, () => {
    runId = engine.start(orgId, { definition: stage1 }).runId;
  }),
  await benchAsync("workflow.advance", 2000, async () => {
    runId = engine.start(orgId, { definition: stage1 }).runId;
    await engine.advance(runId);
  }),
  bench("audit.append", 5000, () => {
    audit.append({
      orgId,
      actorType: "system",
      actorId: "bench",
      action: "bench.append",
      resourceType: "bench",
      resourceId: String(seq++),
      riskLevel: "low",
      decision: "allow",
      result: "success",
    });
  }),
];

console.table(results.map((r) => ({ scenario: r.name, iters: r.iterations, medianMs: r.medianMs, opsPerSec: r.opsPerSec })));
writeFileSync(
  join(here, "results.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      results,
    },
    null,
    2
  ),
  "utf8"
);
d.close();
console.log(`baseline written: ${join(here, "results.json")}`);