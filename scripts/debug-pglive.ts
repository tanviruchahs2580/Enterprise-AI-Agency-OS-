import { PostgresDriver } from "../packages/db/src/pgdriver.ts";

console.log("main: constructing driver (live server)");
const d = new PostgresDriver("postgres://agency:agencyos_pw_2026@127.0.0.1:54329/postgres");
console.log("main: init OK, running query");
const rows = d.all("SELECT 42 AS v");
console.log("query result:", JSON.stringify(rows));
d.close();
process.exit(0);
