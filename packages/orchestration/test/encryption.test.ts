import { test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { SqliteDriver, migrate, Db, genId } from "@agency/db";
import { ENVELOPE_PREFIX, EnvelopeError } from "@agency/core";
import { WorkflowEngine, OrgKeyEncryption } from "@agency/orchestration";
import type { WorkflowDefinition } from "@agency/orchestration";

const KEK = Buffer.alloc(32, 7); // fixed 32-byte test master key

let driver: SqliteDriver;
let db: Db;
let orgA = "";
let orgB = "";

function newOrg(slug: string): string {
  const id = genId("org");
  const now = db.now();
  db.insert("organizations", { id, name: slug, slug, created_at: now, updated_at: now });
  return id;
}

beforeEach(() => {
  driver = new SqliteDriver(":memory:");
  db = new Db(driver);
  migrate(db.driver);
  orgA = newOrg("a");
  orgB = newOrg("b");
});

afterEach(() => {
  driver.close();
});

test("disabled mode is a passthrough: no ciphertext prefix, plaintext preserved", () => {
  const cipher = new OrgKeyEncryption(db, null);
  assert.equal(cipher.enabled, false);
  const token = cipher.encrypt(orgA, '{"secret":"x"}');
  assert.equal(token, '{"secret":"x"}');
  assert.equal(cipher.decrypt(orgA, token), '{"secret":"x"}');
  // no org_data_keys rows are created while disabled
  const rows = db.all("SELECT org_id FROM org_data_keys");
  assert.equal(rows.length, 0);
});

test("enabled mode prefixes ciphertext and decrypts back to the original", () => {
  const cipher = new OrgKeyEncryption(db, KEK);
  assert.equal(cipher.enabled, true);
  const token = cipher.encrypt(orgA, "attack-at-dawn");
  assert.ok(token.startsWith(ENVELOPE_PREFIX), `expected enc:v1: prefix, got ${token}`);
  assert.ok(!token.includes("attack-at-dawn"), "plaintext leaked into ciphertext");
  assert.equal(cipher.decrypt(orgA, token), "attack-at-dawn");
  // a DEK row was created once and reused across calls
  const dek1 = cipher.wrappedDekFor(orgA);
  assert.ok(dek1);
  assert.equal(cipher.decrypt(orgA, cipher.encrypt(orgA, "again")), "again");
  assert.equal(cipher.wrappedDekFor(orgA), dek1);
});

test("per-org DEKs are distinct even under the same KEK", () => {
  const cipher = new OrgKeyEncryption(db, KEK);
  cipher.encrypt(orgA, "a");
  cipher.encrypt(orgB, "b");
  const dekA = cipher.wrappedDekFor(orgA);
  const dekB = cipher.wrappedDekFor(orgB);
  assert.ok(dekA && dekB);
  assert.notEqual(dekA, dekB, "orgs must never share a data key");
});

test("cross-org decryption fails at the crypto layer (isolation in depth)", () => {
  const cipher = new OrgKeyEncryption(db, KEK);
  const token = cipher.encrypt(orgA, "org-a-only");
  assert.throws(() => cipher.decrypt(orgB, token), EnvelopeError);
});

test("tampering with a wrapped DEK breaks decryption on a fresh instance (tag check)", () => {
  const cipher = new OrgKeyEncryption(db, KEK);
  const token = cipher.encrypt(orgA, "inviolable");
  // a live cipher keeps its in-memory DEK, so normal reads stay stable...
  assert.equal(cipher.decrypt(orgA, token), "inviolable");
  // Flip a byte INSIDE the base64 (appending after the '=' padding is ignored
  // by base64 decoders, so the decoded bytes would be unchanged — no tamper).
  const dek = cipher.wrappedDekFor(orgA)!;
  const parts = dek.split(".");
  const ct = parts[3]!;
  parts[3] = (ct.startsWith("A") ? "B" : "A") + ct.slice(1);
  const tampered = parts.join(".");
  assert.notEqual(tampered, dek);
  db.run("UPDATE org_data_keys SET wrapped_dek = ? WHERE org_id = ?", [tampered, orgA]);
  // ...but any fresh instance (next boot, new replica) must fail loudly.
  const fresh = new OrgKeyEncryption(db, KEK);
  assert.throws(() => fresh.decrypt(orgA, token), EnvelopeError);
});

test("non-ciphertext values pass through decrypt untouched", () => {
  const cipher = new OrgKeyEncryption(db, KEK);
  assert.equal(cipher.decrypt(orgA, "plain"), "plain");
});

test("workflow state is encrypted at rest and transparently decrypted on read", async () => {
  const cipher = new OrgKeyEncryption(db, KEK);
  const engine = new WorkflowEngine(db, { codecFor: (orgId) => cipher.codecFor(orgId) });
  engine.registerHandler("t", "alpha", async () => ({ note: "handle-me" }));
  const defn: WorkflowDefinition = { name: "t", stages: [{ name: "alpha" }, { name: "omega" }] };
  const { runId } = engine.start(orgA, { definition: defn, initialState: { sensitive: "s3cr3t" } });

  // at rest: ciphertext only
  const raw = db.get<{ state_json: string }>("SELECT state_json FROM workflow_runs WHERE id = ?", [runId]);
  assert.ok(String(raw?.state_json).startsWith(ENVELOPE_PREFIX));
  assert.ok(!String(raw?.state_json).includes("s3cr3t"));

  // advancing reads and rewrites through the codec without data loss
  const r1 = await engine.advance(runId);
  assert.equal(r1.currentStage, "omega");
  const state = engine.getState(orgA, runId);
  const parsed = JSON.parse(String(state.state_json)) as { sensitive: string; completedStages: string[] };
  assert.equal(parsed.sensitive, "s3cr3t");
  assert.deepEqual(parsed.completedStages, ["alpha"]);
});

test("without a master key the engine stores plaintext state (default behavior)", () => {
  const cipherOff = new OrgKeyEncryption(db, null);
  const engine = new WorkflowEngine(db, { codecFor: (orgId) => cipherOff.codecFor(orgId) });
  const { runId } = engine.start(orgA, { initialState: { plain: "yes" } });
  const raw = db.get<{ state_json: string }>("SELECT state_json FROM workflow_runs WHERE id = ?", [runId]);
  assert.ok(!String(raw?.state_json).startsWith(ENVELOPE_PREFIX));
});