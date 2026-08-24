import { test } from "node:test";
import { strict as assert } from "node:assert";
import { newId, sha256Hex, canonicalJson, newToken } from "../src/ids.ts";
import { AppError } from "../src/errors.ts";
import { EventBus } from "../src/events.ts";
import { createLogger } from "../src/logger.ts";
import { loadConfig, ConfigValidationError } from "../src/config.ts";

test("newId returns prefixed uuidv7, time-ordered", () => {
  const a = newId("tsk");
  const b = newId("tsk");
  assert.ok(a.startsWith("tsk_"));
  assert.ok(b > a || b !== a);
  assert.match(a.slice(4), /^[0-9a-f-]{36}$/);
});

test("sha256Hex is stable and canonicalJson sorts keys", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(canonicalJson({ b: 1, a: [2, { y: 1, x: 2 }] }), '{"a":[2,{"x":2,"y":1}],"b":1}');
});

test("AppError maps codes to status + retryability", () => {
  const e = new AppError("RATE_LIMITED", "slow down");
  assert.equal(e.statusCode, 429);
  assert.equal(e.retryable, true);
  const v = new AppError("VALIDATION_ERROR", "bad");
  assert.equal(v.statusCode, 400);
  assert.equal(v.retryable, false);
  const body = e.toJSON() as { error: { code: string; requestId?: string } };
  assert.equal(body.error.code, "RATE_LIMITED");
});

test("EventBus isolates handler failures and buffers recent events", async () => {
  const bus = new EventBus();
  let called = 0;
  bus.subscribe(() => {
    throw new Error("boom");
  });
  bus.subscribe((e) => {
    if (e.type === "Test") called++;
  });
  bus.emit({ type: "Test", actorType: "system", actorId: "t", payload: {} });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(called, 1);
  assert.equal(bus.recent().length, 1);
});

test("logger redacts sensitive keys", () => {
  const lines: string[] = [];
  const log = createLogger(
    { service: "test", sink: (l) => lines.push(l) },
  );
  log.info("hello", { apiKey: "super-secret", nested: { password: "x", ok: 1 } });
  const rec = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.equal((rec as { apiKey: string }).apiKey, "[REDACTED]");
  const nested = rec.nested as Record<string, unknown>;
  assert.equal(nested.password, "[REDACTED]");
  assert.equal(nested.ok, 1);
});

test("config defaults for local; fails fast in production without admin key", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.NODE_ENV, "local");
  assert.equal(cfg.PORT, 3000);

  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "./data/x.sqlite",
        ADMIN_BOOTSTRAP_KEY: "",
      } as NodeJS.ProcessEnv),
    (err: unknown) => err instanceof ConfigValidationError
  );
});
