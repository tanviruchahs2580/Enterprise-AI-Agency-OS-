#!/usr/bin/env node
/**
 * Apply pending database migrations against DATABASE_URL (default local sqlite).
 */
import { openDatabase, migrate } from "../packages/db/src/index.ts";

const url = process.env.DATABASE_URL ?? "./data/agencyos.sqlite";
console.log(JSON.stringify({ event: "migrating", database: url.replace(/\/[^/]+$/, "/…") }));
const driver = openDatabase(url);
try {
  const applied = migrate(driver);
  console.log(
    JSON.stringify({ event: "migrations_complete", applied: applied.length })
  );
} finally {
  driver.close();
}
