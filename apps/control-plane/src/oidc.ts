import { createHash, createPublicKey, createVerify, randomBytes, type JsonWebKey } from "node:crypto";
import { AppError } from "@agency/core";
import type { AppConfig } from "@agency/core";

/**
 * OIDC Authorization Code + PKCE client (audit Phase 2: ADR-0007
 * IdentityProvider seam). IdP-agnostic: discovery is read from the issuer's
 * `/.well-known/openid-configuration`, ID tokens are verified against the
 * issuer's JWKS (RS256/ES256 only — `none`/HS is rejected), and every auth
 * that lands in the dashboard is exchanged for the normal httpOnly session.
 *
 * The dashboard never sees the IdP's access/id tokens — the control plane
 * consumes them server-side and mints its own session cookie.
 */

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export interface OidcIdTokenClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  nonce?: string;
  email?: string;
  name?: string;
  [claim: string]: unknown;
}

/** JWK in the exact shape `node:crypto` createPublicKey renders for jwk(). */
type Jwk = JsonWebKey;

const STATE_TTL_MS = 600_000; // 10 min
const JWKS_CACHE_MS = 600_000;

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pkceSha256(verifier: string): string {
  return base64UrlEncode(createHash("sha256").update(verifier).digest());
}

export function randomString(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export class OidcClient {
  private discoveryDoc?: OidcDiscovery;
  private jwks?: Jwk[];
  private jwksFetchedAt = 0;
  private readonly cfg: AppConfig;
  private readonly fetchImpl: typeof fetch;

  // NOTE: no TS parameter properties — Node strip-types rejects them (ADR-0003).
  constructor(cfg: AppConfig, fetchImpl: typeof fetch = globalThis.fetch) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  private issuer(): string {
    const i = this.cfg.OIDC_ISSUER?.replace(/\/+$/, "");
    if (!i) throw new AppError("VALIDATION_ERROR", "OIDC_ISSUER is not configured");
    return i;
  }

  async discover(): Promise<OidcDiscovery> {
    if (this.discoveryDoc) return this.discoveryDoc;
    const res = await this.fetchImpl(`${this.issuer()}/.well-known/openid-configuration`);
    if (!res.ok) throw new AppError("DEPENDENCY_UNAVAILABLE", `OIDC discovery failed: HTTP ${res.status}`);
    const doc = (await res.json()) as OidcDiscovery;
    if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
      throw new AppError("DEPENDENCY_UNAVAILABLE", "OIDC discovery document is missing required endpoints");
    }
    this.discoveryDoc = doc;
    return doc;
  }

  /** Build the IdP authorize URL (Authorization Code + PKCE S256). */
  async authorizationUrl(state: string, codeVerifier: string, nonce: string, redirectUri: string): Promise<string> {
    const doc = await this.discover();
    const q = new URLSearchParams({
      client_id: this.cfg.OIDC_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: pkceSha256(codeVerifier),
      code_challenge_method: "S256",
    });
    return `${doc.authorization_endpoint}?${q.toString()}`;
  }

  /** Exchange the authorization code for tokens (PKCE verifier + basic auth). */
  async exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<{ idToken: string; accessToken?: string }> {
    const doc = await this.discover();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: this.cfg.OIDC_CLIENT_ID ?? "",
      code_verifier: codeVerifier,
    });
    const res = await this.fetchImpl(doc.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${this.cfg.OIDC_CLIENT_ID ?? ""}:${this.cfg.OIDC_CLIENT_SECRET ?? ""}`).toString("base64")}`,
      },
      body: body.toString(),
    });
    if (!res.ok) throw new AppError("UNAUTHENTICATED", `OIDC token exchange failed: HTTP ${res.status}`);
    const json = (await res.json()) as { id_token?: string; access_token?: string };
    if (!json.id_token) throw new AppError("UNAUTHENTICATED", "OIDC token response has no id_token");
    return { idToken: json.id_token, accessToken: json.access_token };
  }

  /** Verify an ID token against the issuer's JWKS and return its claims. */
  async verifyIdToken(idToken: string, expectedNonce: string | undefined, expectedAudience?: string): Promise<OidcIdTokenClaims> {
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new AppError("UNAUTHENTICATED", "malformed id_token");
    let header: { alg?: string; kid?: string };
    try {
      header = JSON.parse(Buffer.from(parts[0] ?? "", "base64url").toString("utf8")) as { alg?: string; kid?: string };
    } catch {
      throw new AppError("UNAUTHENTICATED", "bad id_token header");
    }
    const alg = header.alg ?? "";
    if (alg !== "RS256" && alg !== "ES256") {
      throw new AppError("UNAUTHENTICATED", `unsupported id_token alg '${alg}' (RS256/ES256 only)`);
    }
    const keys = await this.getJwks();
    const jwk = keys.find((k) => k.kid === header.kid) ?? (keys.length === 1 ? keys[0] : undefined);
    if (!jwk) throw new AppError("UNAUTHENTICATED", "no matching JWK for id_token kid");
    const publicKey = createPublicKey({ key: jwk as never, format: "jwk" });
    const signingInput = `${parts[0] ?? ""}.${parts[1] ?? ""}`;
    const signature = Buffer.from(parts[2] ?? "", "base64url");
    // OpenSSL signature names, not JOSE algs: RS256 -> RSA-SHA256, ES256 -> sha256.
    const verifyName = alg === "RS256" ? "RSA-SHA256" : "sha256";
    const valid = createVerify(verifyName).update(signingInput).verify(publicKey, signature);
    if (!valid) throw new AppError("UNAUTHENTICATED", "id_token signature invalid");

    let claims: OidcIdTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as OidcIdTokenClaims;
    } catch {
      throw new AppError("UNAUTHENTICATED", "bad id_token payload");
    }
    const now = Math.floor(Date.now() / 1000);
    const skew = 60;
    const doc = await this.discover();
    if (claims.iss !== doc.issuer) throw new AppError("UNAUTHENTICATED", "id_token issuer mismatch");
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const expectAud = expectedAudience ?? this.cfg.OIDC_CLIENT_ID;
    if (!expectAud || !aud.includes(expectAud)) throw new AppError("UNAUTHENTICATED", "id_token audience mismatch");
    if (claims.exp <= now - skew) throw new AppError("UNAUTHENTICATED", "id_token expired");
    if (claims.iat && claims.iat > now + skew) throw new AppError("UNAUTHENTICATED", "id_token issued in the future");
    if (expectedNonce && claims.nonce !== expectedNonce) throw new AppError("UNAUTHENTICATED", "id_token nonce mismatch");
    if (!claims.sub) throw new AppError("UNAUTHENTICATED", "id_token has no subject");
    return claims;
  }

  private async getJwks(): Promise<Jwk[]> {
    const doc = await this.discover();
    if (this.jwks && Date.now() - this.jwksFetchedAt < JWKS_CACHE_MS) return this.jwks;
    const res = await this.fetchImpl(doc.jwks_uri);
    if (!res.ok) throw new AppError("DEPENDENCY_UNAVAILABLE", `JWKS fetch failed: HTTP ${res.status}`);
    const json = (await res.json()) as { keys?: Jwk[] };
    this.jwks = json.keys ?? [];
    this.jwksFetchedAt = Date.now();
    return this.jwks;
  }
}

/** Server-side state store for the OAuth dance (never in cookies). */
export interface OidcStateRecord {
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  expiresAt: number;
}

export class OidcStateStore {
  private states = new Map<string, OidcStateRecord>();

  create(redirectUri: string): { state: string; codeVerifier: string; nonce: string } {
    const state = randomString(24);
    const codeVerifier = randomString(48);
    const nonce = randomString(16);
    this.states.set(state, { codeVerifier, nonce, redirectUri, expiresAt: Date.now() + STATE_TTL_MS });
    return { state, codeVerifier, nonce };
  }

  consume(state: string): OidcStateRecord {
    const rec = this.states.get(state);
    this.states.delete(state); // single-use
    if (!rec) throw new AppError("UNAUTHENTICATED", "unknown or replayed OIDC state");
    if (Date.now() > rec.expiresAt) throw new AppError("UNAUTHENTICATED", "OIDC state expired");
    return rec;
  }
}