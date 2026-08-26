import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { SignedWebhookEmitter, GitHubAdapter } from "../src/index.ts";

/**
 * Runtime-loadability contract: this package must import cleanly under Node
 * native TypeScript execution (no parameter properties — ADR-0003). The v0.6.0
 * webhook wiring was the first runtime consumer; this test locks that in.
 */
test("SignedWebhookEmitter signs, verifies, and emits HMAC-signed deliveries", async () => {
  const hits: { sig?: string; ts?: string; body: string }[] = [];
  const srv: Server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      hits.push({ sig: req.headers["x-agencyos-signature"] as string | undefined, ts: req.headers["x-agencyos-timestamp"] as string | undefined, body: b });
      res.writeHead(200);
      res.end("ok");
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const addr = srv.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  const em = new SignedWebhookEmitter({ url: `http://127.0.0.1:${port}/hook`, secret: "unit-secret" });
  const ok = await em.emit("delivery.completed", { probe: true });
  assert.equal(ok, true, "emit must succeed against a live receiver");
  await new Promise((r) => setTimeout(r, 100));

  assert.equal(hits.length, 1);
  const { sig, ts, body } = hits[0]!;
  assert.ok(sig?.startsWith("sha256="), "signature header present");
  assert.ok(ts, "timestamp header present");
  assert.equal(JSON.parse(body).type, "delivery.completed");
  // signature round-trip verifies against the same secret
  const parsed = JSON.parse(body) as { type: string };
  void parsed;
  assert.equal(em.verify(body, String(ts), String(sig)), true);
  // tampered body fails verification
  assert.equal(em.verify(body + "x", String(ts), String(sig)), false);

  await new Promise<void>((r) => srv.close(() => r()));
});

test("SignedWebhookEmitter disabled without url/secret; GitHubAdapter flags token", async () => {
  const off = new SignedWebhookEmitter({});
  assert.equal(await off.emit("x", {}), false, "disabled emitter is a no-op returning false");
  const ghNoToken = new GitHubAdapter({});
  assert.equal(ghNoToken.enabled, false);
  const ghToken = new GitHubAdapter({ token: "t" });
  assert.equal(ghToken.enabled, true);
});
