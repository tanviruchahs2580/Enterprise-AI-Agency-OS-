/**
 * Extended PostgreSQL production validation (master prompt §11).
 * Requires portable PG on :54329 (see docs/DEPLOYMENT-RUNBOOK.md §local-pg).
 */
import { openDatabase, migrate, Db } from "../packages/db/src/index.ts";

const url = "postgres://agency:agencyos_pw_2026@127.0.0.1:54329/postgres";
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(` ${ok ? "PASS" : "FAIL"}  ${name} ${detail}`);
}

// fresh schema
{
  const d = openDatabase(url);
  d.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  d.close();
}

// clean migration + ordering
{
  const d = openDatabase(url);
  const applied = migrate(d);
  check("clean migration", applied.length === 1 && Number(applied[0]!.version) === 1);
  const rerun = migrate(d);
  check("migration re-run idempotent", rerun.length === 0);
  d.close();
}

// CRUD / constraints / transactions / locking under real PG
{
  const d = openDatabase(url);
  const db = new Db(d);
  const now = db.now();
  db.insert("organizations", { id: "org_x", name: "X", slug: "x", created_at: now, updated_at: now });

  // unique constraint
  try {
    db.insert("organizations", { id: "org_y", name: "Y", slug: "x", created_at: now, updated_at: now });
    check("unique slug enforced", false);
  } catch {
    check("unique slug enforced", true);
  }

  // transaction rollback on failure
  try {
    db.transaction(() => {
      db.insert("projects", { id: "prj_t", org_id: "org_x", name: "T", slug: "t", created_by: "u", created_at: now, updated_at: now });
      throw new Error("force rollback");
    });
  } catch { /* expected */ }
  check("transaction rollback", !db.get("SELECT id FROM projects WHERE id='prj_t'"));

  // concurrent updates via two drivers (two sessions)
  const d2 = openDatabase(url);
  const db2 = new Db(d2);
  db.insert("projects", { id: "prj_c", org_id: "org_x", name: "C", slug: "c", created_by: "u", created_at: now, updated_at: now });
  const w1 = db.updateById("projects", "prj_c", { description: "session1" }, { expectedVersion: 1, bumpVersion: true });
  const w2 = db2.updateById("projects", "prj_c", { description: "session2" }, { expectedVersion: 1, bumpVersion: true });
  check("cross-session optimistic lock", w1 === true && w2 === false);
  d2.close();

  // connection failure surfaces a typed error
  let connErr = false;
  try {
    const bad = openDatabase("postgres://agency:wrong@127.0.0.1:54329/postgres");
    bad.get("SELECT 1");
  } catch {
    connErr = true;
  }
  check("bad credentials fail safely", connErr);

  // reconnect after failure works
  const rows = db.all("SELECT COUNT(*) AS n FROM organizations");
  check("reconnect/continued use after failure attempt", Number(rows[0]?.n) >= 1);
  d.close();
}

console.log(`\nPG extended validation: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
