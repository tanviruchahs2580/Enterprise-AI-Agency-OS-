// PostgreSQL bridge worker (CJS). Owns the pg Pool for the sync bridge.
// See pgdriver.ts — results are serialized into the caller's SharedArrayBuffer
// BEFORE signaling, so Atomics.wait returns with the full payload.
const { parentPort } = require("node:worker_threads");
const enc = new TextEncoder();
let pool = null;

parentPort.on("message", async (msg) => {
  const u8 = new Uint8Array(msg.sharedBuf, 8);
  const i32 = new Int32Array(msg.sharedBuf, 0, 2);
  const finish = (obj) => {
    let payload;
    try {
      payload = enc.encode(JSON.stringify(obj));
    } catch (_e) {
      payload = enc.encode(JSON.stringify({ ok: false, error: "serialize failed" }));
    }
    if (payload.length > u8.length) {
      const errPayload = enc.encode(JSON.stringify({ ok: false, error: "result exceeds bridge limit" }));
      u8.set(errPayload);
      Atomics.store(i32, 1, errPayload.length);
      Atomics.store(i32, 0, 1);
      Atomics.notify(i32, 0);
      return;
    }
    u8.set(payload);
    Atomics.store(i32, 1, payload.length);
    Atomics.store(i32, 0, 1);
    Atomics.notify(i32, 0);
  };
  try {
    if (msg.kind === "init") {
      const { Pool } = require("pg");
      pool = new Pool({ connectionString: msg.connectionString, max: msg.max || 10 });
      await pool.query("SELECT 1");
      finish({ ok: true });
    } else if (msg.kind === "query") {
      // Translate SQLite-style '?' placeholders to PostgreSQL $1..$n.
      let n = 0;
      const pgSql = String(msg.sql).replace(/\?/g, () => "$" + ++n);
      if (n > 0 && n !== (msg.params || []).length) {
        finish({ ok: false, error: "placeholder/param count mismatch (" + n + " vs " + (msg.params || []).length + ")" });
        return;
      }
      const res = await pool.query(pgSql, msg.params || []);
      finish({ ok: true, rows: res.rows, rowCount: res.rowCount });
    } else if (msg.kind === "end") {
      if (pool) await pool.end();
      pool = null;
      finish({ ok: true });
    } else {
      finish({ ok: false, error: "unknown bridge kind" });
    }
  } catch (e) {
    const err = e || {};
    const extra = [err.position ? "position=" + err.position : null, err.where ? "where=" + err.where : null]
      .filter(Boolean)
      .join(" ");
    finish({ ok: false, error: String(err.message || e) + (extra ? " (" + extra + ")" : "") });
  }
});
