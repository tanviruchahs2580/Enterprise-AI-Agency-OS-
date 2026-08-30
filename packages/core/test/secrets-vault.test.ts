import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig, VaultSecretResolver } from "@agency/core";

/**
 * T-D: HashiCorp Vault (KV v2) secret resolution adapter against an in-process
 * mock Vault. Exercised paths: static-token reads, AppRole login, KV v2 404,
 * path prefix, and config validation gating.
 */

interface MockVaultHandlers {
  onLogin?: (body: unknown) => { ok: boolean; clientToken?: string; status?: number };
  secrets: Map<string, { value?: string; [k: string]: unknown }>;
  requireAuth?: boolean;
}

function startMockVault(h: MockVaultHandlers): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "POST" && url.pathname === "/v1/auth/approle/login") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const raw = Buffer.concat(chunks).toString();
          let parsed: unknown = {};
          try { parsed = JSON.parse(raw); } catch { /* ignore */ }
          const out = h.onLogin?.(parsed) ?? { ok: true, clientToken: "mock-client-token" };
          if (!out.ok) {
            res.writeHead(out.status ?? 403, { "content-type": "application/json" });
            res.end(JSON.stringify({ errors: ["invalid role/secret id"] }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ auth: { client_token: out.clientToken } }));
          return;
        }
        const m = url.pathname?.match(/^\/v1\/secret\/data\/(.+)$/);
        if (req.method === "GET" && m) {
          if (h.requireAuth && req.headers["x-vault-token"] !== "mock-client-token") {
            res.writeHead(403, { "content-type": "application/json" });
            res.end(JSON.stringify({ errors: ["permission denied"] }));
            return;
          }
          const name = decodeURIComponent(m[1]!);
          const entry = h.secrets.get(name);
          if (!entry) {
            res.writeHead(404, { "content-type": "application/json" });
            res.end(JSON.stringify({ errors: [] }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ data: { data: entry } }));
          return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end("{}");
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return reject(new Error("no port"));
      resolve({
        port: addr.port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
    server.on("error", reject);
  });
}

test("T-D vault resolver primes and serves secrets via a static token (KV v2)", async () => {
  const mock = await startMockVault({
    requireAuth: true,
    secrets: new Map([["MODEL_PROVIDER_API_KEY", { value: "vault-key" }]]),
  });
  try {
    const resolver = new VaultSecretResolver({
      addr: `http://127.0.0.1:${mock.port}`,
      token: "mock-client-token",
    });
    await resolver.prime(["MODEL_PROVIDER_API_KEY", "GITHUB_TOKEN"]);
    assert.equal(resolver.get("MODEL_PROVIDER_API_KEY"), "vault-key");
    assert.equal(resolver.get("GITHUB_TOKEN"), undefined);
    assert.deepEqual([...resolver.missing], ["GITHUB_TOKEN"]);
  } finally {
    await mock.close();
  }
});

test("T-D vault resolver authenticates via AppRole before reads", async () => {
  const mock = await startMockVault({
    requireAuth: true,
    onLogin: (body) => {
      const b = body as { role_id?: string; secret_id?: string };
      return b.role_id === "r1" && b.secret_id === "s1"
        ? { ok: true, clientToken: "mock-client-token" }
        : { ok: false, status: 403 };
    },
    secrets: new Map([["WEBHOOK_OUTBOUND_SECRET", { value: "wh-secret" }]]),
  });
  try {
    const resolver = new VaultSecretResolver({
      addr: `http://127.0.0.1:${mock.port}`,
      roleId: "r1",
      secretId: "s1",
    });
    await resolver.prime(["WEBHOOK_OUTBOUND_SECRET"]);
    assert.equal(resolver.get("WEBHOOK_OUTBOUND_SECRET"), "wh-secret");
    assert.equal(resolver.backend, "vault");
  } finally {
    await mock.close();
  }
});

test("T-D vault resolver honors the KV path prefix", async () => {
  const mock = await startMockVault({
    requireAuth: true,
    secrets: new Map([
      ["agencyos/prod/MODEL_PROVIDER_API_KEY", { value: "prefixed-key" }],
    ]),
  });
  try {
    const resolver = new VaultSecretResolver({
      addr: `http://127.0.0.1:${mock.port}`,
      token: "mock-client-token",
      pathPrefix: "agencyos/prod",
    });
    await resolver.prime(["MODEL_PROVIDER_API_KEY"]);
    assert.equal(resolver.get("MODEL_PROVIDER_API_KEY"), "prefixed-key");
  } finally {
    await mock.close();
  }
});

test("T-D vault config requires addr and an auth method", () => {
  assert.throws(
    () => loadConfig({ SECRET_BACKEND: "vault" } as NodeJS.ProcessEnv),
    /VAULT_ADDR/
  );
  assert.throws(
    () =>
      loadConfig({ SECRET_BACKEND: "vault", VAULT_ADDR: "https://vault.example.com" } as NodeJS.ProcessEnv),
    /VAULT_TOKEN/
  );
  const ok = loadConfig({
    SECRET_BACKEND: "vault",
    VAULT_ADDR: "https://vault.example.com",
    VAULT_ROLE_ID: "r",
    VAULT_SECRET_ID: "s",
    NODE_ENV: "test",
  } as NodeJS.ProcessEnv);
  assert.equal(ok.SECRET_BACKEND, "vault");
  assert.equal(ok.VAULT_KV_MOUNT, "secret");
});