#!/usr/bin/env node
/**
 * Seed development data: default org, bootstrap admin key, agent roster,
 * default quality gates and a daily budget. Idempotent.
 */
import { loadEnvFile } from "./lib/env.mjs";
import { loadConfig, createLogger, newId, newToken, sha256Hex } from "../packages/core/src/index.ts";
import { openDatabase, migrate, Db } from "../packages/db/src/index.ts";
import { AgentRegistry } from "../packages/orchestration/src/index.ts";

loadEnvFile();
const cfg = loadConfig();
const log = createLogger({ service: "seed", level: "info" });

const driver = openDatabase(cfg.DATABASE_URL);
migrate(driver);
const db = new Db(driver);

// default organization
let org = db.get("SELECT id FROM organizations WHERE slug = 'default'");
if (!org) {
  const now = db.now();
  db.insert("organizations", {
    id: newId("org"),
    name: "Default Organization",
    slug: "default",
    created_at: now,
    updated_at: now,
  });
  org = db.get("SELECT id FROM organizations WHERE slug = 'default'");
}
const orgId = String(org.id);

// bootstrap admin API key (idempotent by hash)
const adminKey = cfg.ADMIN_BOOTSTRAP_KEY || `aao_${newToken(24)}`;
const hash = sha256Hex(adminKey);
if (!db.get("SELECT id FROM api_keys WHERE key_hash = ?", [hash])) {
  db.insert("api_keys", {
    id: `key_${hash.slice(0, 24)}`,
    org_id: orgId,
    name: "bootstrap-admin",
    key_hash: hash,
    role: "OWNER",
    scopes: JSON.stringify(["*"]),
    created_at: db.now(),
  });
}

// agent roster
const registry = new AgentRegistry(db);
const seeded = registry.seedRoster(orgId);

// default quality gates
for (const gate of [
  ["coverage-line", { threshold: 80 }],
  ["coverage-branch", { threshold: 60 }],
  ["security-scan", { maxSeverity: "high" }],
  ["secrets-scan", {}],
]) {
  if (!db.get("SELECT id FROM quality_gates WHERE org_id=? AND name=?", [orgId, gate[0]])) {
    db.insert("quality_gates", {
      id: newId("gate"),
      org_id: orgId,
      name: gate[0],
      config: JSON.stringify(gate[1]),
      enabled: 1,
      created_at: db.now(),
    });
  }
}

// default daily budget
if (!db.get("SELECT id FROM budgets WHERE org_id=? AND scope_type='daily'", [orgId])) {
  db.insert("budgets", {
    id: newId("bud"),
    org_id: orgId,
    scope_type: "daily",
    scope_id: "*",
    limit_usd: Number(process.env.DEFAULT_DAILY_BUDGET_USD ?? 25),
    action: "block",
    created_at: db.now(),
  });
}

log.info("seed complete", {
  seededAgents: seeded,
  adminKeyPrintedOnce: cfg.ADMIN_BOOTSTRAP_KEY ? "from env" : adminKey,
});

driver.close();
