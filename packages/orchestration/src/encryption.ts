import {
  newDataKey,
  wrapKey,
  unwrapKey,
  encryptEnvelope,
  decryptEnvelope,
  ENVELOPE_PREFIX,
  type FieldCodec,
} from "@agency/core";
import type { Db } from "@agency/db";

interface OrgDataKeyRow {
  org_id: string;
  wrapped_dek: string;
}

/**
 * Per-workspace envelope encryption (audit Phase 4):
 *
 * - The organisation master key (KEK) is never stored — ENCRYPTION_MASTER_KEY
 *   is supplied via config (env / Vault).
 * - Each org's data-encryption key (DEK) is generated fresh, wrapped by the
 *   KEK with AES-256-GCM, and persisted in `org_data_keys.wrapped_dek`. The DEK
 *   never appears in the clear at rest or in memory beyond its cached Buffer.
 * - Field values are encrypted with the org DEK and tagged `enc:v1:`.
 *
 * Defence in depth: even if a query incorrectly leaks a row from another org,
 * the ciphertext was encrypted under that org's DEK — decryption fails the GCM
 * tag check, so cross-org reads fail at the crypto layer, not just the SQL layer.
 */
export class OrgKeyEncryption {
  private keys = new Map<string, Buffer>();
  private readonly masterKey: Buffer | null;
  private readonly db: Db;

  constructor(db: Db, masterKey: Buffer | null) {
    this.db = db;
    this.masterKey = masterKey;
  }

  /** True when a KEK is configured and encryption is active. */
  get enabled(): boolean {
    return this.masterKey !== null;
  }

  /** Per-org codec; passthrough (no-op) when encryption is disabled. */
  codecFor(orgId: string): FieldCodec {
    if (!this.masterKey) return { encrypt: (p) => p, decrypt: (t) => t };
    return {
      encrypt: (plaintext) => this.encrypt(orgId, plaintext),
      decrypt: (token) => this.decrypt(orgId, token),
    };
  }

  encrypt(orgId: string, plaintext: string): string {
    if (!this.masterKey) return plaintext;
    return ENVELOPE_PREFIX + encryptEnvelope(this.orgKey(orgId), plaintext);
  }

  decrypt(orgId: string, token: string): string {
    if (!this.masterKey) return token;
    if (!token.startsWith(ENVELOPE_PREFIX)) return token;
    return decryptEnvelope(this.orgKey(orgId), token.slice(ENVELOPE_PREFIX.length));
  }

  /** The persisted wrapped DEK (used by tests to verify isolation/tamper-evidence). */
  wrappedDekFor(orgId: string): string | undefined {
    const row = this.db.get<OrgDataKeyRow>("SELECT org_id, wrapped_dek FROM org_data_keys WHERE org_id = ?", [
      orgId,
    ]);
    return row?.wrapped_dek;
  }

  private orgKey(orgId: string): Buffer {
    const cached = this.keys.get(orgId);
    if (cached) return cached;
    const master = this.masterKey;
    if (!master) {
      throw new Error("OrgKeyEncryption.orgKey called while disabled");
    }
    const existing = this.db.get<OrgDataKeyRow>(
      "SELECT org_id, wrapped_dek FROM org_data_keys WHERE org_id = ?",
      [orgId]
    );
    let dataKey: Buffer;
    if (existing) {
      dataKey = unwrapKey(master, existing.wrapped_dek);
    } else {
      dataKey = newDataKey();
      const wrapped = wrapKey(master, dataKey);
      const now = this.db.now();
      this.db.transaction(() => {
        this.db.insert("org_data_keys", {
          org_id: orgId,
          version: 1,
          wrapped_dek: wrapped,
          algorithm: "aes-256-gcm",
          created_at: now,
          rotated_at: null,
        });
      });
    }
    this.keys.set(orgId, dataKey);
    return dataKey;
  }
}