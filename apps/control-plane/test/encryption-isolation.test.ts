import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildContext,
  type AppContext,
} from "../src/context.ts";
import {
  loadConfig,
  ConfigValidationError,
  ENVELOPE_PREFIX,
  EnvelopeError,
  parseMasterKey,
} from "@agency/core";
import { WorkflowEngine, OrgKeyEncryption } from "@agency/orchestration";

const KEK_B64 = Buffer.alloc(32, 3).toString("base64");
let dataDir: string;

before(() => {
  dataDir = mkdtempSync(join(tmpdir(), "agencyos-enc-"));
});

after(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* disposable temp dir */
  }
});

function envOverrides(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: join(dataDir, `enc-${Math.random().toString(16).slice(2)}.sqlite`),
    LOG_LEVEL: "error",
    SANDBOX_PROVIDER: "process",
    PORT: "0",
    ENCRYPT_AT_REST: "true",
    ENCRYPTION_MASTER_KEY: KEK_B64,
  };
}

function newOrg(ctx: AppContext, slug: string): string {
  const id = `org_${Math.random().toString(16).slice(2)}`;
  const now = ctx.db.now();
  ctx.db.insert("organizations", { id, name: slug, slug, created_at: now, updated_at: now });
  return id;
}

test("config fails fast when ENCRYPT_AT_REST=true without a master key", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "test", DATABASE_URL: ":memory:", ENCRYPT_AT_REST: "true" }),
    ConfigValidationError
  );
});

test("workflow state is encrypted at rest and served plaintext via the engine (T-H)", async () => {
  const ctx = buildContext(envOverrides());
  try {
    assert.equal(ctx.encryption.enabled, true);
    const orgId = ctx.defaultOrgId();
    const { runId } = ctx.workflows.start(orgId, { initialState: { secret: "needle-42" } });

    const raw = ctx.db.get<{ state_json: string }>("SELECT state_json FROM workflow_runs WHERE id = ?", [runId]);
    assert.ok(String(raw?.state_json).startsWith(ENVELOPE_PREFIX), "state_json must be ciphertext at rest");
    assert.ok(!String(raw?.state_json).includes("needle-42"), "plaintext must not appear in the row");

    const served = ctx.workflows.getState(orgId, runId);
    const parsed = JSON.parse(String(served.state_json)) as { secret: string };
    assert.equal(parsed.secret, "needle-42");

    assert.ok(ctx.encryption.wrappedDekFor(orgId), "org data key must be persisted");
  } finally {
    ctx.db.driver.close();
  }
});

test("orgs get distinct data keys and cross-org reads fail at the crypto layer (T-L)", async () => {
  const ctx = buildContext(envOverrides());
  try {
    const orgA = ctx.defaultOrgId();
    const orgB = newOrg(ctx, "b");
    const runA = ctx.workflows.start(orgA, { initialState: { secret: "for-org-a" } });
    const runB = ctx.workflows.start(orgB, { initialState: { secret: "for-org-b" } });

    const dekA = ctx.encryption.wrappedDekFor(orgA);
    const dekB = ctx.encryption.wrappedDekFor(orgB);
    assert.ok(dekA && dekB);
    assert.notEqual(dekA, dekB, "orgs must not share a DEK");

    // SQL isolation: cross-org getState is NOT_FOUND.
    assert.throws(() => ctx.workflows.getState(orgB, runA.runId), /not found/);
    assert.throws(() => ctx.workflows.getState(orgA, runB.runId), /not found/);

    // Crypto isolation: even with a raw row leaked, org B cannot decrypt org A.
    const rawA = ctx.db.get<{ state_json: string }>("SELECT state_json FROM workflow_runs WHERE id = ?", [
      runA.runId,
    ]);
    const raw = String(rawA?.state_json);
    // distribution/dedupe guard: non-undefined raw
    assert.ok(raw.startsWith(ENVELOPE_PREFIX));
    assert.throws(
      () => ctx.encryption.decrypt(orgB, raw),
      EnvelopeError,
      "org B decryption of org A ciphertext must fail the GCM tag check"
    );
    const decrypted = ctx.encryption.decrypt(orgA, raw);
    assert.notEqual(decrypted, raw, "decryption must return plaintext, not ciphertext");
    assert.equal((JSON.parse(decrypted) as { secret: string }).secret, "for-org-a");
    void runB;
  } finally {
    ctx.db.driver.close();
  }
});

test("tampering with an org's wrapped data key invalidates reads after restart (tamper-evidence)", async () => {
  const ctx = buildContext(envOverrides());
  try {
    const orgId = ctx.defaultOrgId();
    const run = ctx.workflows.start(orgId, { initialState: { secret: "immutable" } });
    // a live cipher holds the in-memory DEK, so a hot patch cannot desync reads
    assert.equal(ctx.workflows.getState(orgId, run.runId).status, "running");
    const dek = ctx.encryption.wrappedDekFor(orgId);
    assert.ok(dek);
    // Flip a byte INSIDE the base64 of the wrapped DEK. (Appending is a no-op:
    // base64 decoders ignore anything after the trailing '=' padding, so the
    // decoded key would be unchanged and GCM would rightly pass.)
    const parts = dek.split(".");
    const ct = parts[3]!;
    parts[3] = (ct.startsWith("A") ? "B" : "A") + ct.slice(1);
    const tampered = parts.join(".");
    assert.notEqual(tampered, dek);
    ctx.db.run("UPDATE org_data_keys SET wrapped_dek = ?, rotated_at = ? WHERE org_id = ?", [
      tampered,
      ctx.db.now(),
      orgId,
    ]);
    // any fresh instance (restart, new replica) must fail loudly instead of
    // silently decrypting garbage.
    const freshCipher = new OrgKeyEncryption(ctx.db, parseMasterKey(KEK_B64));
    const raw = ctx.db.get<{ state_json: string }>("SELECT state_json FROM workflow_runs WHERE id = ?", [
      run.runId,
    ]);
    assert.throws(() => freshCipher.decrypt(orgId, String(raw?.state_json)), EnvelopeError);
    const freshEngine = new WorkflowEngine(ctx.db, { codecFor: (id) => freshCipher.codecFor(id) });
    assert.throws(() => freshEngine.getState(orgId, run.runId), EnvelopeError);
  } finally {
    ctx.db.driver.close();
  }
});