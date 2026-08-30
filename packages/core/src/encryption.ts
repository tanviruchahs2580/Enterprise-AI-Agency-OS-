/**
 * Field-level encryption seam (audit Phases 3-4: at-rest encryption and
 * per-workspace org keys).
 *
 * A `FieldCodec` is injected where sensitive payloads are persisted. Default
 * is `PASSTHROUGH_CODEC` (encryption disabled), so the engine behaves exactly
 * as before unless a master key is configured. When enabled, persisted values
 * carry the `enc:v1:` prefix so ciphertext is unambiguous and never
 * accidentially treated as plaintext.
 */
export interface FieldCodec {
  /** Encrypt a plaintext value for storage. */
  encrypt(plaintext: string): string;
  /** Decrypt a stored value; passthrough for values that are not ciphertext. */
  decrypt(token: string): string;
}

/** No-op codec: encryption disabled. */
export const PASSTHROUGH_CODEC: FieldCodec = {
  encrypt: (plaintext) => plaintext,
  decrypt: (token) => token,
};

/** Marker prefix for envelope-ciphertext values. */
export const ENVELOPE_PREFIX = "enc:v1:";