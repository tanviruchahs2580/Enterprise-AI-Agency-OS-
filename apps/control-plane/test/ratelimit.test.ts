import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimitStore, routeClassFor } from "../src/ratelimit.ts";

test("routeClassFor: dispatch routes + default", () => {
  assert.equal(routeClassFor("/api/v1/delivery/runs"), "dispatch");
  assert.equal(routeClassFor("/api/v1/executions/x1"), "dispatch");
  assert.equal(routeClassFor("/api/v1/projects"), "default");
  assert.equal(routeClassFor("/api/v1/events?ticket=abc"), "default");
});

test("memory store: allows within limit, blocks over limit", async () => {
  const store = createRateLimitStore(null, {
    store: "memory",
    windowMs: 60_000,
    limits: { default: 3, dispatch: 10 },
  });
  const r1 = await store.check("k1", "default", "org1", Date.now());
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);
  const r2 = await store.check("k1", "default", "org1", Date.now());
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);
  const r3 = await store.check("k1", "default", "org1", Date.now());
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);
  const r4 = await store.check("k1", "default", "org1", Date.now());
  assert.equal(r4.allowed, false);
  assert.ok(r4.retryAfterMs !== undefined && r4.retryAfterMs > 0);
});

test("memory store: window rollover resets count", async () => {
  const store = createRateLimitStore(null, {
    store: "memory",
    windowMs: 100,
    limits: { default: 2, dispatch: 10 },
  });
  const now = Date.now();
  await store.check("k1", "default", "org1", now);
  await store.check("k1", "default", "org1", now);
  const blocked = await store.check("k1", "default", "org1", now);
  assert.equal(blocked.allowed, false);
  const afterWindow = await store.check("k1", "default", "org1", now + 150);
  assert.equal(afterWindow.allowed, true);
  assert.equal(afterWindow.remaining, 1);
});

test("memory store: separate keys and classes are independent", async () => {
  const store = createRateLimitStore(null, {
    store: "memory",
    windowMs: 60_000,
    limits: { default: 1, dispatch: 1 },
  });
  const now = Date.now();
  const r1 = await store.check("k1", "default", "org1", now);
  assert.equal(r1.allowed, true);
  const r1b = await store.check("k1", "default", "org1", now);
  assert.equal(r1b.allowed, false);
  // different key
  const r2 = await store.check("k2", "default", "org1", now);
  assert.equal(r2.allowed, true);
  // different class
  const r3 = await store.check("k1", "dispatch", "org1", now);
  assert.equal(r3.allowed, true);
  // different org
  const r4 = await store.check("k1", "default", "org2", now);
  assert.equal(r4.allowed, true);
});
