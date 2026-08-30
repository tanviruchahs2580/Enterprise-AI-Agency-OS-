import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption primitives (audit Phases 3-4).
 *
 * - `parseMasterKey` turns the base64 `ENCRYPTION_MASTER_KEY` into a 32-byte key.
 * - `encryptEnvelope` AES-256-GCM encrypts a UTF-8 string and returns a single
 *   transportable token `v1.<ivB64>.<tagB64>.<cipherB64>`. GCM gives
 *   authenticated encryption; the tag protects both confidentiality and
 *   integrity. Each call uses a fresh random IV (encryption is non-deterministic).
 * - Per-workspace data keys are wrapped with the same envelope: `wrapKey`/
 *   `unwrapKey` treat the 32-byte data key as the plaintext.
 *
 * No crypto is ever keyed off user input, and no key material is logged.
 */
export class EnvelopeError extends Error {}

export function parseMasterKey(base64: string): Buffer {
  if (!base64) throw new EnvelopeError("ENCRYPTION_MASTER_KEY is required");
  let decoded: Buffer;
  try {
    decoded = Buffer.from(base64, "base64");
  } catch {
    throw new EnvelopeError("ENCRYPTION_MASTER_KEY is not valid base64");
  }
  if (decoded.length !== 32) {
    throw new EnvelopeError("ENCRYPTION_MASTER_KEY must decode to exactly 32 bytes (AES-256)");
  }
  return decoded;
}

/** Fresh AES-256-GCM key material (for per-workspace data keys). */
export function newDataKey(): Buffer {
  return randomBytes(32);
}

export interface EnvelopeToken {
  version: "1";
  iv: string;
  tag: string;
  ciphertext: string;
}

export function encryptEnvelope(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptEnvelope(key: Buffer, token: string): string {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new EnvelopeError("invalid envelope token");
  const [, ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64 ?? "", "base64");
  const tag = Buffer.from(tagB64 ?? "", "base64");
  const ciphertext = Buffer.from(cipherB64 ?? "", "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (e) {
    throw new EnvelopeError(`decryption failed: ${String(e instanceof Error ? e.message : e)}`);
  }
}

/** Wrap a 32-byte data key with the master key (envelope) — returns the token. */
export function wrapKey(masterKey: Buffer, dataKey: Buffer): string {
  return encryptEnvelope(masterKey, dataKey.toString("base64"));
}

/** Unwrap a wrapped data key; validates the tag (tamper-evident). */
export function unwrapKey(masterKey: Buffer, wrapped: string): Buffer {
  const b64 = decryptEnvelope(masterKey, wrapped);
  const decoded = Buffer.from(b64, "base64");
  if (decoded.length !== 32) throw new EnvelopeError("unwrapped data key is not 32 bytes");
  return decoded;
}