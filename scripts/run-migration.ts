/**
 * Run a specific SQL migration file against the database.
 *
 * Usage:
 *   npx tsx scripts/run-migration.ts <path-to-sql-file>
 *
 * Example:
 *   npx tsx scripts/run-migration.ts apps/api/src/db/migrations/0012_anomaly_baselines.sql
 */

import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

async function main() {
  const file = process.argv[2];

  if (!file) {
    console.error("Usage: npx tsx scripts/run-migration.ts <path-to-sql-file>");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const filePath = resolve(file);
  console.log(`Reading migration: ${filePath}`);

  const migration = readFileSync(filePath, "utf-8");
  const sql = postgres(dbUrl);

  try {
    await sql.unsafe(migration);
    console.log("Migration applied successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
