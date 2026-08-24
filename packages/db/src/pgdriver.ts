import { Worker } from "node:worker_threads";
import type { DatabaseDriver, Row, RunResult } from "./driver.ts";

/**
 * Synchronous bridge over node-postgres (GAP G-01).
 *
 * The platform consumes a synchronous DatabaseDriver surface (SQLite
 * semantics). This driver executes PostgreSQL queries on a worker thread
 * (pgworker.cjs) that owns a pg.Pool. Results are serialized INTO the per-call
 * SharedArrayBuffer BEFORE the completion signal, so Atomics.wait returns with
 * the full payload available synchronously.
 *
 * Concurrency: calls from a given thread serialize (SQLite-like semantics);
 * pg.Pool still multiplexes other clients/replicas. Placeholder translation
 * ('?' → $n) keeps every existing repository call site unchanged.
 */

const PAYLOAD_BYTES = 16 * 1024 * 1024; // 16MB cap per result set

export class PostgresDriver implements DatabaseDriver {
  readonly kind = "postgres" as const;
  private worker: Worker;

  constructor(connectionString: string, maxPool = 10) {
    this.worker = new Worker(new URL("./pgworker.cjs", import.meta.url));
    this.call("init", [], { connectionString, maxPool });
  }

  private call(
    kind: string,
    params?: unknown[],
    opts?: { connectionString?: string; maxPool?: number },
    sql?: string
  ): { ok: boolean; rows?: Row[]; rowCount?: number; error?: string } {
    // Layout: [flag:i32][len:i32][payload bytes...]
    const sharedBuf = new SharedArrayBuffer(8 + PAYLOAD_BYTES);
    const i32 = new Int32Array(sharedBuf, 0, 2);
    Atomics.store(i32, 0, 0);
    Atomics.store(i32, 1, 0);

    this.worker.postMessage({
      kind,
      sql,
      params: params ?? [],
      connectionString: opts?.connectionString,
      max: opts?.maxPool,
      sharedBuf,
    });

    for (;;) {
      const state = Atomics.wait(i32, 0, 0, 30_000);
      if (Atomics.load(i32, 0) !== 0) break;
      if (state === "timed-out") {
        throw new Error(`postgres bridge timeout waiting for '${kind}'`);
      }
    }
    const len = Atomics.load(i32, 1);
    if (len === 0) throw new Error("postgres bridge returned empty result");
    const bytes = new Uint8Array(sharedBuf, 8, len);
    return JSON.parse(new TextDecoder().decode(bytes)) as {
      ok: boolean; rows?: Row[]; rowCount?: number; error?: string;
    };
  }

  exec(sql: string): void {
    const r = this.call("query", undefined, undefined, sql);
    if (!r.ok) throw new Error(`postgres exec failed: ${r.error}`);
  }

  run(sql: string, params: unknown[] = []): RunResult {
    const r = this.call("query", params, undefined, sql);
    if (!r.ok) throw new Error(r.error ?? "postgres query failed");
    return { changes: Number(r.rowCount ?? 0), lastInsertRowid: 0 };
  }

  all(sql: string, params: unknown[] = []): Row[] {
    const r = this.call("query", params, undefined, sql);
    if (!r.ok) throw new Error(r.error ?? "postgres query failed");
    return r.rows ?? [];
  }

  get(sql: string, params: unknown[] = []): Row | undefined {
    return this.all(sql, params)[0];
  }

  transaction<T>(fn: () => T): T {
    this.exec("BEGIN");
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
    try {
      this.call("end");
    } finally {
      void this.worker.terminate();
    }
  }
}
