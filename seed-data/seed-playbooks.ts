/**
 * Seed script: inserts global playbook templates (organization_id = null).
 * Idempotent: checks for existing playbooks by name before inserting.
 *
 * Usage:
 *   npx tsx seed-data/seed-playbooks.ts
 */

import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard";

const sql = postgres(DATABASE_URL);

interface PlaybookTemplate {
  name: string;
  description: string;
  trigger: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
}

async function seed() {
  const raw = readFileSync(
    join(__dirname, "playbook-templates.json"),
    "utf-8",
  );
  const templates: PlaybookTemplate[] = JSON.parse(raw);

  for (const tpl of templates) {
    // Check if already exists (by name, global scope)
    const existing = await sql`
      SELECT id FROM playbooks
      WHERE name = ${tpl.name} AND organization_id IS NULL
      LIMIT 1
    `;

    if (existing.length > 0) {
      console.log(`  [skip] "${tpl.name}" already exists`);
      continue;
    }

    await sql`
      INSERT INTO playbooks (
        organization_id, name, description, trigger, steps,
        is_active, execution_count
      ) VALUES (
        NULL,
        ${tpl.name},
        ${tpl.description},
        ${sql.json(tpl.trigger)},
        ${sql.json(tpl.steps)},
        true,
        0
      )
    `;
    console.log(`  [created] "${tpl.name}"`);
  }

  console.log("\nPlaybook templates seeded successfully.");
  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  sql.end();
  process.exit(1);
});
