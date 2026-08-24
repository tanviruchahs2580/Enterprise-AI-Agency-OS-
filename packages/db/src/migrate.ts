import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "@agency/core";
import type { DatabaseDriver } from "./driver.ts";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
}

function loadMigrationFiles(): { version: number; name: string; sql: string; checksum: string }[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((f) => {
    const match = /^(\d+)_/.exec(f);
    if (!match) throw new Error(`migration file must start with numeric version: ${f}`);
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    return {
      version: Number.parseInt(match[1]!, 10),
      name: f,
      sql,
      checksum: sha256Hex(sql),
    };
  });
}

/**
 * Dialect translation: the canonical schema is written in the SQLite dialect.
 * For PostgreSQL we apply a small, auditable set of rewrites (GAP G-01):
 *   - drop PRAGMA lines (SQLite-only)
 *   - AUTOINCREMENT integer PKs → BIGSERIAL
 */
export function translateForPostgres(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*PRAGMA\b/i.test(line))
    .join("\n")
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "BIGSERIAL PRIMARY KEY");
}

function migrationSql(m: { sql: string }, kind: "sqlite" | "postgres"): string {
  return kind === "postgres" ? translateForPostgres(m.sql) : m.sql;
}

/**
 * Versioned, checksum-verified migration runner.
 * - Applied migrations are never re-run; checksum drift is a hard error (tamper detection).
 * - Each migration runs inside a transaction.
 */
export function migrate(db: DatabaseDriver): AppliedMigration[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Map<number, { name: string; checksum: string }>();
  for (const row of db.all("SELECT version, name, checksum FROM _migrations ORDER BY version")) {
    applied.set(Number(row.version), { name: String(row.name), checksum: String(row.checksum) });
  }

  const out: AppliedMigration[] = [];
  for (const m of loadMigrationFiles()) {
    const existing = applied.get(m.version);
    if (existing) {
      if (existing.checksum !== m.checksum) {
        throw new Error(
          `migration ${m.name} checksum drift — file was modified after being applied. ` +
            `Applied checksum=${existing.checksum} file checksum=${m.checksum}`
        );
      }
      continue;
    }
    const sql = migrationSql(m, db.kind);
    db.transaction(() => {
      db.exec(sql);
      db.run(
        "INSERT INTO _migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
        [m.version, m.name, m.checksum, new Date().toISOString()]
      );
    });
    out.push({ version: m.version, name: m.name, checksum: m.checksum });
  }
  return out;
}

export function migrationStatus(db: DatabaseDriver): {
  applied: AppliedMigration[];
  pending: number;
} {
  const rows = db
    .all("SELECT version, name, checksum, applied_at FROM _migrations ORDER BY version")
    .map((r) => ({
      version: Number(r.version),
      name: String(r.name),
      checksum: String(r.checksum),
    }));
  const pending = loadMigrationFiles().filter(
    (m) => !rows.some((r) => r.version === m.version)
  ).length;
  return { applied: rows, pending };
}
