/** Minimal PG connectivity probe for certification gate. */
import { openDatabase } from "../packages/db/src/index.ts";
const d = openDatabase("postgres://agency:agencyos_pw_2026@127.0.0.1:54329/postgres");
d.get("SELECT 1 AS ok");
console.log("pg ok");
d.close();
