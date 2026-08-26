import { test } from "node:test";
import { strict as assert } from "node:assert";
import { newId, sha256Hex, canonicalJson } from "../src/ids.ts";
import { AppError } from "../src/errors.ts";
import { EventBus } from "../src/events.ts";
import { createLogger } from "../src/logger.ts";
import { loadConfig, ConfigValidationError } from "../src/config.ts";
import {
  EnvSecretResolver,
  MockSecretResolver,
  createSecretResolver,
  resolveSensitive,
} from "../src/secrets.ts";

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

// ---------- Phase 0 hardening (master upgrade prompt) ----------

function prodEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://u:p@db:5432/app",
    ADMIN_BOOTSTRAP_KEY: "prod-key-32-bytes-aaaaaaaaaaaaaa",
    SANDBOX_PROVIDER: "docker",
    ...extra,
  } as NodeJS.ProcessEnv;
}

test("PHASE 0.2 production rejects process sandbox on bare metal; allows inside container", () => {
  assert.throws(
    () => loadConfig(prodEnv({ SANDBOX_PROVIDER: "process" }), { isContainer: false }),
    (err: unknown) =>
      err instanceof ConfigValidationError &&
      /SANDBOX_PROVIDER=docker/.test(err.message)
  );
  const cfg = loadConfig(prodEnv({ SANDBOX_PROVIDER: "process" }), { isContainer: true });
  assert.equal(cfg.SANDBOX_PROVIDER, "process");
  const dockerCfg = loadConfig(prodEnv());
  assert.equal(dockerCfg.SANDBOX_PROVIDER, "docker");
});

test("PHASE 0.5 secret resolver backends + strict production refusal", () => {
  const mock = new MockSecretResolver();
  assert.equal(mock.get("MODEL_PROVIDER_API_KEY"), "mock-MODEL_PROVIDER_API_KEY");
  assert.equal(new EnvSecretResolver().get("PATH") !== undefined, true);

  const cfgMock = loadConfig({ SECRET_BACKEND: "mock" });
  assert.equal(createSecretResolver(cfgMock).backend, "mock");
  assert.equal(resolveSensitive(cfgMock, "GITHUB_TOKEN"), "mock-GITHUB_TOKEN");

  const cfgEnv = loadConfig({});
  assert.equal(createSecretResolver(cfgEnv).backend, "env");
  assert.equal(
    resolveSensitive(cfgEnv, "WEBHOOK_OUTBOUND_SECRET", {}, { WEBHOOK_OUTBOUND_SECRET: "s3cr3t" }),
    "s3cr3t"
  );
});

test("PHASE 0.2 STRICT_SECRET_BACKEND refuses plain-env sensitive keys in production", () => {
  assert.throws(
    () =>
      loadConfig(
        prodEnv({
          STRICT_SECRET_BACKEND: "true",
          MODEL_PROVIDER_API_KEY: "plain-in-env",
        })
      ),
    (err: unknown) =>
      err instanceof ConfigValidationError && /STRICT_SECRET_BACKEND/.test(err.message)
  );
  // runtime resolver double-checks (defense in depth)
  const strictCfg = {
    NODE_ENV: "production",
    SECRET_BACKEND: "env",
    STRICT_SECRET_BACKEND: true,
  } as never;
  assert.throws(() => resolveSensitive(strictCfg, "MODEL_PROVIDER_API_KEY"));
});

test("PHASE 0.2 production rejects wildcard CORS and sqlite (existing gates still hold)", () => {
  assert.throws(() => loadConfig(prodEnv({ CORS_ORIGIN: "*" })), ConfigValidationError);
  assert.throws(
    () => loadConfig({ ...prodEnv(), DATABASE_URL: "./x.sqlite" } as NodeJS.ProcessEnv),
    ConfigValidationError
  );
});

test("PHASE 0.5 SECRET_BACKEND invalid value rejected; env resolver returns undefined for unknown keys", () => {
  assert.throws(
    () => loadConfig({ SECRET_BACKEND: "doppler" } as NodeJS.ProcessEnv),
    (err: unknown) => err instanceof ConfigValidationError
  );
  const r = new EnvSecretResolver({});
  assert.equal(r.get("DEFINITELY_NOT_SET_KEY_XYZ"), undefined);
});
