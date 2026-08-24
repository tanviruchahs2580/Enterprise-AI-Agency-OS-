import { randomUUID, randomBytes, createHash } from "node:crypto";

/**
 * UUIDv7: time-ordered identifiers (48-bit ms timestamp + random).
 * Preferred over v4 so primary keys are roughly sortable and B-tree friendly.
 */
export function newId(prefix?: string): string {
  const ts = Date.now();
  const bytes = randomBytes(10);
  const b = Buffer.alloc(16);
  b.writeUInt32BE(Math.floor(ts / 2 ** 16), 0);
  b.writeUInt16BE(ts % 2 ** 16, 4);
  bytes.copy(b, 6);
  // set version 7 and variant bits
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;

  const hex = b.toString("hex");
  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");

  return prefix ? `${prefix}_${uuid}` : uuid;
}

/** Short opaque token for API keys / webhook signatures (never stored in clear). */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function canonicalJson(value: unknown): string {
  // Deterministic JSON: sorted object keys — required for stable hashes.
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortValue((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

// Re-export for convenience in services that need plain v4.
export const uuid = randomUUID;
