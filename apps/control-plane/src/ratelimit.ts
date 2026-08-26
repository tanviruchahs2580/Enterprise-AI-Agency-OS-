/**
 * Phase C1 — distributed-safe rate limiting (F-09).
 * Memory buckets for dev/tests; Postgres/Shared SQLite via rate_limit_counters
 * table with atomic UPSERT (window rollover + count RETURNING).
 */
import type { Db } from "@agency/db";


export type RateLimitClass = "default" | "dispatch";
export type RateLimitStoreType = "memory" | "postgres";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterMs?: number;
  windowStart: string;
}

export interface RateLimitStore {
  readonly name: string;
  check(keyHash: string, routeClass: RateLimitClass, orgId: string, nowMs: number): Promise<RateLimitResult>;
}

class MemoryStore implements RateLimitStore {
  readonly name = "memory" as const;
  private buckets = new Map<string, { count: number; windowStart: number }>();
  lastPrune = 0;
  private windowMs: number;
  private limits: Record<RateLimitClass, number>;
  constructor(windowMs: number, limits: Record<RateLimitClass, number>) {
    this.windowMs = windowMs;
    this.limits = limits;
  }
  async check(keyHash: string, routeClass: RateLimitClass, orgId: string, nowMs: number): Promise<RateLimitResult> {
    const limit = this.limits[routeClass];
    const id = `${orgId}|${keyHash}|${routeClass}`;
    if (nowMs - this.lastPrune >= 60_000) {
      this.lastPrune = nowMs;
      for (const [k, v] of this.buckets) if (nowMs - v.windowStart > 600_000) this.buckets.delete(k);
    }
    const b = this.buckets.get(id);
    if (!b || nowMs - b.windowStart >= this.windowMs) {
      this.buckets.set(id, { count: 1, windowStart: nowMs });
      return {
        allowed: true,
        remaining: limit - 1,
        limit,
        windowStart: new Date(nowMs).toISOString(),
      };
    }
    const count = b.count + 1;
    this.buckets.set(id, { count, windowStart: b.windowStart });
    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        limit,
        retryAfterMs: this.windowMs - (nowMs - b.windowStart),
        windowStart: new Date(b.windowStart).toISOString(),
      };
    }
    return { allowed: true, remaining: limit - count, limit, windowStart: new Date(b.windowStart).toISOString() };
  }
}

class PostgresStore implements RateLimitStore {
  readonly name = "postgres" as const;
  private db: Db;
  private windowMs: number;
  private limits: Record<RateLimitClass, number>;
  constructor(db: Db, windowMs: number, limits: Record<RateLimitClass, number>) {
    this.db = db;
    this.windowMs = windowMs;
    this.limits = limits;
  }

  async check(keyHash: string, routeClass: RateLimitClass, orgId: string, nowMs: number): Promise<RateLimitResult> {
    const limit = this.limits[routeClass];
    const nowIso = new Date(nowMs).toISOString();
    // Atomic UPSERT: new window → reset count+window; same window → bump count.
    // Supported on both SQLite and Postgres via ON CONFLICT.
    const row = this.db.get<{ count: number; window_start: string }>(
      `INSERT INTO rate_limit_counters(org_id, key_hash, route_class, window_start, count)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(org_id, key_hash, route_class) DO UPDATE SET
         count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ? THEN ? ELSE window_start END
       RETURNING count, window_start`,
      [
        orgId,
        keyHash,
        routeClass,
        nowIso,
        new Date(nowMs - this.windowMs).toISOString(),
        new Date(nowMs - this.windowMs).toISOString(),
        nowIso,
      ]
    );
    const count = Number(row?.count ?? 1);
    const ws = String(row?.window_start ?? nowIso);
    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        limit,
        retryAfterMs: this.windowMs - (nowMs - Date.parse(ws)),
        windowStart: ws,
      };
    }
    return { allowed: true, remaining: limit - count, limit, windowStart: ws };
  }
}

export function createRateLimitStore(
  db: Db | null,
  opts: { store: RateLimitStoreType; windowMs: number; limits: Record<RateLimitClass, number> }
): RateLimitStore {
  if (opts.store === "postgres" && db) return new PostgresStore(db, opts.windowMs, opts.limits);
  return new MemoryStore(opts.windowMs, opts.limits);
}

export function routeClassFor(url: string): RateLimitClass {
  const path = url.split("?")[0] ?? url;
  if (path.startsWith("/api/v1/delivery/runs") || path.startsWith("/api/v1/executions")) return "dispatch";
  return "default";
}
