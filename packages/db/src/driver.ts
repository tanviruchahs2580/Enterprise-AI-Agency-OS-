import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/**
 * Normalize a SQLite DATABASE_URL into a safe, absolute filesystem path.
 *
 * `file://` URLs are passed through (node:sqlite understands them natively);
 * relative paths are resolved against the process working directory so behavior
 * is deterministic across launch locations.
 */
function normalizeSqlitePath(url: string): string {
  if (url === ":memory:") return url;
  if (url.startsWith("file://")) return url;
  return isAbsolute(url) ? url : resolve(process.cwd(), url);
}

export type Row = Record<string, unknown>;
type SqlParams = Parameters<StatementSync["run"]>;

export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

/**
 * Driver abstraction so the platform is not bound to one engine (ADR-0004).
 * SQLite implementation ships in-process via node:sqlite; the PostgreSQL
 * driver implements the same synchronous surface for production deployments.
 */
export interface DatabaseDriver {
  readonly kind: "sqlite" | "postgres";
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): RunResult;
  all(sql: string, params?: unknown[]): Row[];
  get(sql: string, params?: unknown[]): Row | undefined;
  transaction<T>(fn: () => T): T;
  close(): void;
}

export class SqliteDriver implements DatabaseDriver {
  readonly kind = "sqlite" as const;
  private db: InstanceType<typeof DatabaseSync> | null;

  constructor(file: string) {
    if (file !== ":memory:") {
      const realPath = file.startsWith("file://") ? fileURLToPath(file) : file;
      mkdirSync(dirname(realPath), { recursive: true });
    }
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
  }

  exec(sql: string): void {
    this.db!.exec(sql);
  }

  run(sql: string, params: unknown[] = []): RunResult {
    const res = this.db!.prepare(sql).run(...(params as SqlParams));
    return { changes: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
  }

  all(sql: string, params: unknown[] = []): Row[] {
    return this.db!.prepare(sql).all(...(params as SqlParams)) as Row[];
  }

  get(sql: string, params: unknown[] = []): Row | undefined {
    return this.db!.prepare(sql).get(...(params as SqlParams)) as Row | undefined;
  }

  transaction<T>(fn: () => T): T {
    this.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.exec("COMMIT");
      return out;
    } catch (e) {
      this.exec("ROLLBACK");
      throw e;
    }
  }

  close(): void {
    if (this.db) {
      // Guarantee committed WAL frames are folded back into the main database
      // file before the handle is released, so a subsequent process (or a
      // crash-restart) never reads a database missing recent transactions.
      try {
        this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      } catch {
        // best-effort: a closed/readonly handle must not block shutdown
      }
      this.db.close();
      this.db = null; // idempotent — double close is a no-op
    }
  }
}

/** Resolve a driver from a DATABASE_URL-style string. */
export function openDatabase(url: string): DatabaseDriver {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    // Lazy require keeps `pg` loadable only for PostgreSQL deployments.
    const require = createRequire(import.meta.url);
    type PgDriverModule = {
      PostgresDriver: new (url: string, maxPool?: number) => DatabaseDriver;
    };
    const mod = require("./pgdriver.ts") as PgDriverModule;
    return new mod.PostgresDriver(url);
  }
  return new SqliteDriver(normalizeSqlitePath(url));
}
