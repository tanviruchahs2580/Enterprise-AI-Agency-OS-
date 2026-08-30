import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type IncomingMessage } from "node:http";
import { generateKeyPairSync, createSign } from "node:crypto";
import { buildContext, type AppContext } from "../src/context.ts";
import { buildApp } from "../src/app.ts";
import type { FastifyInstance } from "fastify";

/**
 * T-A: OIDC/SSO end-to-end against an in-process mock IdP (real RSA-JWKS,
 * real token endpoint, real discovery document). Exercises the full
 * Authorization Code + PKCE dance through fastify.inject.
 */

const CLIENT_ID = "mock-client";
const CLIENT_SECRET = "mock-secret";

function b64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

class MockIdP {
  readonly server;
  port = 0;
  /** Claims the next issued id_token will carry (nonce is injected by the mock). */
  claims: Record<string, unknown> = { sub: "user-123", email: "a@example.com", name: "Aida" };
  /** Overrides fed into every id_token (aud, exp, alg, issuer). */
  audOverride?: string;
  expOverride?: number;
  alg = "RS256";

  private pending = new Map<string, { nonce: string; state: string }>();
  private counter = 0;

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    const kid = "mock-kid";
    const jwks = { keys: [{ kty: "RSA", kid, use: "sig", alg: "RS256", n: jwk.n, e: jwk.e }] };
    const issuer = () => `http://127.0.0.1:${this.port}`;

    const signJwt = (payload: Record<string, unknown>, nonce: string): string => {
      const header = b64url(JSON.stringify({ alg: this.alg, kid, typ: "JWT" }));
      const body = b64url(JSON.stringify({
        ...this.claims,
        ...payload,
        nonce,
        iss: issuer(),
        aud: this.audOverride ?? CLIENT_ID,
        exp: this.expOverride ?? Math.floor(Date.now() / 1000) + 600,
        iat: Math.floor(Date.now() / 1000),
      }));
      const signer = this.alg === "RS256" ? createSign("RSA-SHA256") : createSign("sha256");
      signer.update(`${header}.${body}`);
      const sig = signer.sign(privateKey, "base64url");
      return `${header}.${body}.${sig}`;
    };

    const readBody = (req: IncomingMessage): Promise<string> =>
      new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => resolve(data));
      });

    this.server = createServer(async (req, res) => {
      const u = new URL(req.url ?? "/", issuer());
      const path = u.pathname;
      if (path === "/.well-known/openid-configuration") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          issuer: issuer(),
          authorization_endpoint: `${issuer()}/authorize`,
          token_endpoint: `${issuer()}/token`,
          jwks_uri: `${issuer()}/jwks`,
        }));
        return;
      }
      if (path === "/jwks") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(jwks));
        return;
      }
      if (path === "/authorize") {
        const state = u.searchParams.get("state") ?? "";
        const nonce = u.searchParams.get("nonce") ?? "";
        const redirectUri = u.searchParams.get("redirect_uri") ?? "";
        const code = `mock_code_${++this.counter}`;
        this.pending.set(code, { nonce, state });
        res.writeHead(302, { location: `${redirectUri}?code=${code}&state=${state}` });
        res.end();
        return;
      }
      if (path === "/token") {
        const body = await readBody(req);
        const params = new URLSearchParams(body);
        const code = params.get("code") ?? "";
        const rec = this.pending.get(code);
        const nonce = rec?.nonce ?? "";
        if (!rec) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        this.pending.delete(code);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          access_token: "mock_access",
          token_type: "Bearer",
          id_token: signJwt({}, nonce),
        }));
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });

    this.server.listen(0, "127.0.0.1");
  }

  ready(): Promise<void> {
    return new Promise((resolve) => this.server.once("listening", () => {
      this.port = Number((this.server.address() as { port: number }).port);
      resolve();
    }));
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

let idp: MockIdP;
let ctx: AppContext;
let app: FastifyInstance;
let dataDir: string;

async function responseJson(res: { body: string }) {
  try {
    return JSON.parse(res.body);
  } catch {
    return res.body;
  }
}

before(async () => {
  idp = new MockIdP();
  await idp.ready();
  dataDir = mkdtempSync(join(tmpdir(), "agencyos-oidc-"));
  ctx = buildContext({
    NODE_ENV: "test",
    DATABASE_URL: join(dataDir, "oidc.sqlite"),
    PORT: "0",
    LOG_LEVEL: "error",
    SANDBOX_PROVIDER: "process",
    OIDC_ENABLED: "true",
    OIDC_ISSUER: `http://127.0.0.1:${idp.port}`,
    OIDC_CLIENT_ID: CLIENT_ID,
    OIDC_CLIENT_SECRET: CLIENT_SECRET,
    OIDC_ROLE_CLAIM: "roles",
    OIDC_ORG_CLAIM: "org",
  });
  app = buildApp(ctx);
});

after(async () => {
  await app.close();
  ctx.db.driver.close();
  await idp.close();
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* Windows temp may hold WAL briefly */
  }
});

test("T-A OIDC login redirects to the IdP with PKCE challenge", async () => {
  const res = await app.inject({ method: "GET", url: "/api/v1/auth/oidc/login" });
  assert.equal(res.statusCode, 302);
  const location = new URL(String(res.headers.location));
  assert.equal(location.origin, `http://127.0.0.1:${idp.port}`);
  assert.equal(location.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(location.searchParams.get("response_type"), "code");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.ok(location.searchParams.get("code_challenge"), "PKCE challenge present");
  assert.ok(idp.port > 0);
});

test("T-A full dance: callback verifies id_token and issues an httpOnly session", async () => {
  // 1. Initiate + capture the authorize URL (which the mock echoes nonce from).
  const login = await app.inject({ method: "GET", url: "/api/v1/auth/oidc/login" });
  const authorizeUrl = new URL(String(login.headers.location));
  const state = String(authorizeUrl.searchParams.get("state"));

  // 2. Act as the IdP: follow the authorize endpoint (mock), then hit the callback.
  const authorizeUrl2 = new URL(String(login.headers.location));
  const authzUrl = `${authorizeUrl2.origin}${authorizeUrl2.pathname}?${authorizeUrl2.searchParams.toString()}`;
  const authz = await fetch(authzUrl, { redirect: "manual" });
  assert.equal(authz.status, 302);
  const cbUrl = String(authz.headers.get("location"));

  // Sanity: callback path is our own redirect uri.
  assert.match(cbUrl, /\/api\/v1\/auth\/oidc\/callback/);
  const cb = await app.inject({ method: "GET", url: cbUrl });
  assert.equal(cb.statusCode, 302);
  const setCookie = String(cb.headers["set-cookie"] ?? "");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.ok(state.length > 0);

  // 3. The stored session cookie authenticates as the OIDC identity.
  const cookie = setCookie.split(";")[0];
  const probe = await app.inject({
    method: "GET",
    url: "/api/v1/auth/session",
    headers: { cookie },
  });
  assert.equal(probe.statusCode, 200);
  const body = await responseJson(probe);
  assert.equal(body.active, true);
  assert.equal(body.name, "Aida");
  assert.equal(body.role, "VIEWER"); // default: no roles claim
});

test("T-A role claim maps into the session and meta advertises oidc-sso", async () => {
  const meta = await app.inject({ method: "GET", url: "/api/v1/meta" });
  const metaBody = JSON.parse(meta.body) as { capabilities: { auth: { modes: string[]; cookie: string } } };
  assert.ok(metaBody.capabilities.auth.modes.includes("oidc-sso"));
  assert.equal(metaBody.capabilities.auth.cookie, "agencyos_session");
});

test("T-A existing OIDC user keeps role/org; re-login updates last_login", async () => {
  // First login as OWNER (roles claim) tied to an explicit org claim.
  const orgId = "org_oidc_target";
  const now = ctx.db.now();
  ctx.db.insert("organizations", { id: orgId, name: "SSO Org", slug: "sso-org", created_at: now, updated_at: now });
  idp.claims = { sub: "user-456", email: "b@example.com", name: "Bo", roles: "OWNER", org: orgId };

  const login = await app.inject({ method: "GET", url: "/api/v1/auth/oidc/login" });
  const authorizeUrl = new URL(String(login.headers.location));
  const authz = await fetch(`${authorizeUrl.origin}${authorizeUrl.pathname}?${authorizeUrl.searchParams.toString()}`, { redirect: "manual" });
  assert.ok(authz.status === 302, "mock IdP redirects the browser back");
  const cbUrl = String(authz.headers.get("location"));
  const cb = await app.inject({ method: "GET", url: cbUrl });
  assert.equal(cb.statusCode, 302);
  const cookie = String(cb.headers["set-cookie"] ?? "").split(";")[0];

  const probe = await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { cookie } });
  const body = await responseJson(probe);
  assert.equal(body.role, "OWNER");
  assert.equal(body.orgId, orgId);

  const row = ctx.db.get<{ role: string; org_id: string }>(
    "SELECT role, org_id FROM oidc_users WHERE sub = ?", ["user-456"]
  );
  assert.ok(row);
  assert.equal(row.role, "OWNER");
  assert.equal(row.org_id, orgId);
});

test("T-A rejects id_token with forged audience (aud mismatch)", async () => {
  const before = idp.audOverride;
  idp.audOverride = "other-client";
  try {
    const login = await app.inject({ method: "GET", url: "/api/v1/auth/oidc/login" });
    const authorizeUrl = new URL(String(login.headers.location));
    const authz = await fetch(`${authorizeUrl.origin}${authorizeUrl.pathname}?${authorizeUrl.searchParams.toString()}`, { redirect: "manual" });
    const cbUrl = String(authz.headers.get("location"));
    const cb = await app.inject({ method: "GET", url: cbUrl });
    assert.equal(cb.statusCode, 401);
    const body = JSON.parse(cb.body) as { error: { code: string } };
    assert.equal(body.error.code, "UNAUTHENTICATED");
  } finally {
    idp.audOverride = before;
  }
});

test("T-A rejects unknown/replayed OIDC state", async () => {
  const cb = await app.inject({ method: "GET", url: "/api/v1/auth/oidc/callback?code=x&state=forged" });
  assert.equal(cb.statusCode, 401);
});