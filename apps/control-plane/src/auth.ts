import { sha256Hex, AppError, newId, newToken } from "@agency/core";
import type { Db } from "@agency/db";
import { hasPermission, type Permission } from "@agency/security";

export interface Identity {
  userId: string;
  orgId: string;
  role: string;
  name: string;
  keyId: string;
}

export interface SessionRecord {
  token: string;
  sessionId: string;
  expiresAt: string;
}

const DEFAULT_SESSION_TTL_MS = 86_400_000; // 24h

/**
 * API-key authentication. Keys are stored only as SHA-256 hashes.
 * The IdentityProvider seam (ADR-0007) allows OIDC/SSO later without
 * touching route code — routes depend on `requirePermission` only.
 */
export class AuthService {
  private db: Db;
  /** Throttles last_used_at writes: at most one UPDATE per key per window. */
  private static LAST_USED_WRITE_MS = 60_000;
  private lastUsedAt = new Map<string, number>();

  constructor(db: Db) {
    this.db = db;
  }

  /** Registers the bootstrap admin key for an org (idempotent). */
  ensureBootstrapKey(orgId: string, keyMaterial: string): void {
    const hash = sha256Hex(keyMaterial);
    const existing = this.db.get<{ id: string }>(
      "SELECT id FROM api_keys WHERE key_hash = ?",
      [hash]
    );
    if (existing) return;
    this.db.insert("api_keys", {
      id: `key_${sha256Hex(hash).slice(0, 24)}`,
      org_id: orgId,
      name: "bootstrap-admin",
      key_hash: hash,
      role: "OWNER",
      scopes: JSON.stringify(["*"]),
      created_at: this.db.now(),
    });
  }

  createKey(orgId: string, name: string, role: string): { id: string; keyMaterial: string } {
    const material = `aao_${newToken(24)}`;
    const id = newId("key");
    this.db.insert("api_keys", {
      id,
      org_id: orgId,
      name,
      key_hash: sha256Hex(material),
      role,
      scopes: JSON.stringify([]),
      created_at: this.db.now(),
    });
    return { id, keyMaterial: material };
  }

  /** Phase A/F-06: soft revoke — takes effect immediately on next request. */
  revokeKey(orgId: string, keyId: string): boolean {
    const res = this.db.driver.run(
      "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND org_id = ? AND revoked_at IS NULL",
      [this.db.now(), keyId, orgId]
    );
    return Number(res.changes) > 0;
  }

  /** Phase A/F-06: rotate = revoke old + issue replacement in one step. */
  rotateKey(orgId: string, keyId: string): { keyMaterial: string; newKeyId: string } | null {
    const row = this.db.get<{ name: string; role: string }>(
      "SELECT name, role FROM api_keys WHERE id=? AND org_id=? AND revoked_at IS NULL",
      [keyId, orgId]
    );
    if (!row) return null;
    const created = this.createKey(orgId, `${row.name}-rotated`, row.role);
    const ok = this.revokeKey(orgId, keyId);
    if (!ok) return null; // raced with another revocation
    return { keyMaterial: created.keyMaterial, newKeyId: created.id };
  }

  /** Org-scoped listing that NEVER exposes hash or material. */
  listKeys(orgId: string) {
    return this.db.all(
      "SELECT id, name, role, last_used_at, revoked_at, created_at FROM api_keys WHERE org_id=? ORDER BY created_at DESC LIMIT 200",
      [orgId]
    );
  }

  authenticate(bearer: string | undefined): Identity {
    if (!bearer) throw new AppError("UNAUTHENTICATED", "missing bearer token");
    const hash = sha256Hex(bearer);
    const row = this.db.get<{
      id: string;
      org_id: string;
      user_id: string | null;
      role: string;
      name: string;
      revoked_at: string | null;
    }>(
      "SELECT id, org_id, user_id, role, name, revoked_at FROM api_keys WHERE key_hash = ?",
      [hash]
    );
    if (!row) throw new AppError("UNAUTHENTICATED", "invalid API key");
    if (row.revoked_at) throw new AppError("UNAUTHENTICATED", "API key revoked");

    // Write last_used_at at most once per minute per key — hot-path auth stays
    // read-only on Postgres while ops still get fresh-enough usage signals.
    const now = Date.now();
    const last = this.lastUsedAt.get(row.id) ?? 0;
    if (now - last >= AuthService.LAST_USED_WRITE_MS) {
      this.db.run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", [
        new Date(now).toISOString(),
        row.id,
      ]);
      this.lastUsedAt.set(row.id, now);
    }
    return {
      userId: row.user_id ?? `apikey:${row.name}`,
      orgId: String(row.org_id),
      role: row.role,
      name: row.name,
      keyId: row.id,
    };
  }

  requirePermission(identity: Identity, permission: Permission): void {
    if (!hasPermission(identity.role as never, permission)) {
      throw new AppError("FORBIDDEN", `role '${identity.role}' lacks permission '${permission}'`, {
        details: { required: permission },
      });
    }
  }

  // ---------- httpOnly cookie sessions (audit Phase 1.2) ----------

  /**
   * Exchange an authenticated Identity for a short-lived session token. The
   * token is stored only as a SHA-256 hash; the raw session reaches the browser
   * solely inside an httpOnly cookie set by the route.
   */
  createSession(identity: Identity, ttlMs = DEFAULT_SESSION_TTL_MS): SessionRecord {
    const token = `sess_${newToken(40)}`;
    const id = newId("sess");
    const now = Date.now();
    const expiresAt = new Date(now + ttlMs).toISOString();
    // Opportunistic housekeeping: drop expired/revoked sessions while here.
    this.db.run(
      "DELETE FROM auth_sessions WHERE expires_at < ? OR revoked_at IS NOT NULL",
      [new Date(now).toISOString()]
    );
    this.db.insert("auth_sessions", {
      id,
      org_id: identity.orgId,
      key_id: identity.keyId,
      user_id: identity.userId,
      user_name: identity.name,
      role: identity.role,
      token_hash: sha256Hex(token),
      expires_at: expiresAt,
      created_at: new Date(now).toISOString(),
      last_seen_at: new Date(now).toISOString(),
    });
    return { token, sessionId: id, expiresAt };
  }

  /** Resolve an Identity from a session token (cookie), or throw. */
  authenticateSession(token: string, now = Date.now()): Identity {
    if (!token) throw new AppError("UNAUTHENTICATED", "missing session cookie");
    const row = this.db.get<{
      id: string;
      org_id: string;
      key_id: string;
      user_id: string | null;
      user_name: string;
      role: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      "SELECT id, org_id, key_id, user_id, user_name, role, expires_at, revoked_at FROM auth_sessions WHERE token_hash = ?",
      [sha256Hex(token)]
    );
    if (!row) throw new AppError("UNAUTHENTICATED", "invalid session");
    if (row.revoked_at) throw new AppError("UNAUTHENTICATED", "session revoked");
    if (Date.parse(row.expires_at) <= now) {
      throw new AppError("UNAUTHENTICATED", "session expired");
    }
    // Throttled last_seen_at writes mirror the API-key pattern (hot path stays read-only).
    const key = `${row.id}`;
    const last = this.lastUsedAt.get(key) ?? 0;
    if (now - last >= AuthService.LAST_USED_WRITE_MS) {
      this.db.run("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?", [
        new Date(now).toISOString(),
        row.id,
      ]);
      this.lastUsedAt.set(key, now);
    }
    return {
      userId: row.user_id ?? `apikey:${row.user_name}`,
      orgId: String(row.org_id),
      role: row.role,
      name: row.user_name,
      keyId: row.key_id,
    };
  }

  /** Soft-revoke a session; takes effect on the next request. */
  revokeSession(token: string): boolean {
    const res = this.db.driver.run(
      "UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
      [this.db.now(), sha256Hex(token)]
    );
    return Number(res.changes) > 0;
  }
}
