import { newId } from "@agency/core";
import type { DatabaseDriver, Row } from "./driver.ts";

export * from "./driver.ts";
export * from "./migrate.ts";

/** Thin typed facade over the driver with org-scoped helpers. */
export class Db {
  public readonly driver: DatabaseDriver;
  private slowMs: number;
  private onSlow?: (sql: string, ms: number) => void;

  constructor(
    driver: DatabaseDriver,
    opts?: { slowMs?: number; onSlow?: (sql: string, ms: number) => void }
  ) {
    this.driver = driver;
    this.slowMs = opts?.slowMs ?? 0;
    this.onSlow = opts?.onSlow;
  }

  private timed<T>(sql: string, fn: () => T): T {
    // Instrumentation is enabled by attaching onSlow; slowMs is the threshold
    // (0 = report every query). Without onSlow, no overhead at all.
    if (!this.onSlow) return fn();
    const t0 = Date.now();
    const res = fn();
    const ms = Date.now() - t0;
    if (ms >= this.slowMs) this.onSlow(sql, ms);
    return res;
  }

  run(sql: string, params: unknown[] = []): void {
    this.timed(sql, () => this.driver.run(sql, params));
  }

  all<T = Row>(sql: string, params: unknown[] = []): T[] {
    return this.timed(sql, () => this.driver.all(sql, params)) as T[];
  }

  get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
    return this.timed(sql, () => this.driver.get(sql, params)) as T | undefined;
  }

  transaction<T>(fn: () => T): T {
    return this.driver.transaction(fn);
  }

  insert(table: string, data: Record<string, unknown>): void {
    const keys = Object.keys(data);
    const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
    this.timed(sql, () => this.driver.run(sql, keys.map((k) => data[k])));
  }

  /**
   * Update a row by id. When `expectedVersion` is provided the update is
   * conditional on the current optimistic-lock version (which is then bumped).
   */
  updateById(
    table: string,
    id: string,
    data: Record<string, unknown>,
    opts?: { expectedVersion?: number; bumpVersion?: boolean }
  ): boolean {
    const cols = Object.keys(data);
    const setSql =
      cols.map((c) => `${c} = ?`).join(", ") +
      (opts?.bumpVersion && !("version" in data) ? ", version = version + 1" : "");
    const params = [...cols.map((c) => data[c]), id];
    let sql = `UPDATE ${table} SET ${setSql} WHERE id = ?`;
    if (opts?.expectedVersion !== undefined) {
      sql += ` AND version = ${Number(opts.expectedVersion)}`;
    }
    const res = this.driver.run(sql, params);
    return Number(res.changes) > 0;
  }

  now(): string {
    return new Date().toISOString();
  }

  /** Release the underlying driver handle (checkpoints WAL, closes the DB). */
  close(): void {
    this.driver.close();
  }
}

export function genId(prefix: string): string {
  return newId(prefix);
}
