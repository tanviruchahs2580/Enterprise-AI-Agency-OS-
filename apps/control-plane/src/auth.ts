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
}
