import { newId } from "@agency/core";
import type { DatabaseDriver, Row } from "./driver.ts";

export * from "./driver.ts";
export * from "./migrate.ts";

/** Thin typed facade over the driver with org-scoped helpers. */
export class Db {
  public readonly driver: DatabaseDriver;
  constructor(driver: DatabaseDriver) {
    this.driver = driver;
  }

  run(sql: string, params: unknown[] = []): void {
    this.driver.run(sql, params);
  }

  all<T = Row>(sql: string, params: unknown[] = []): T[] {
    return this.driver.all(sql, params) as T[];
  }

  get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
    return this.driver.get(sql, params) as T | undefined;
  }

  transaction<T>(fn: () => T): T {
    return this.driver.transaction(fn);
  }

  insert(table: string, data: Record<string, unknown>): void {
    const keys = Object.keys(data);
    const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
    this.driver.run(sql, keys.map((k) => data[k]));
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
}

export function genId(prefix: string): string {
  return newId(prefix);
}
