/**
 * Seed default users for each demo organization.
 *
 * Creates ADMIN, OPERATOR, and AUDITOR users per org with a shared dev password.
 * IDEMPOTENT: upserts by email (skips if user already exists).
 *
 * Run via:
 *   npx tsx scripts/seed-users.ts
 */

import postgres from "postgres";
import { scryptSync, randomBytes } from "node:crypto";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard";

const DEV_PASSWORD = "SpaceGuard2026!";

// ---------------------------------------------------------------------------
// Password hashing (must match auth.service.ts)
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// ---------------------------------------------------------------------------
// User definitions per org domain
// ---------------------------------------------------------------------------

interface UserDef {
  emailPrefix: string;
  name: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER" | "AUDITOR";
}

const USER_TEMPLATES: UserDef[] = [
  { emailPrefix: "admin", name: "Platform Administrator", role: "ADMIN" },
  { emailPrefix: "ops", name: "Mission Operator", role: "OPERATOR" },
  { emailPrefix: "auditor", name: "Compliance Auditor", role: "AUDITOR" },
];

// Map org contact email domain to org name (for lookup)
const ORG_DOMAINS: Array<{ orgContactEmail: string; emailDomain: string }> = [
  { orgContactEmail: "ops@proba-space.eu", emailDomain: "proba-space.eu" },
  { orgContactEmail: "security@nordsat.io", emailDomain: "nordsat.io" },
  { orgContactEmail: "ciso@medsat-comm.gr", emailDomain: "medsat-comm.gr" },
  { orgContactEmail: "security@orbitalwatch.eu", emailDomain: "orbitalwatch.eu" },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const sql = postgres(connectionString);

  try {
    console.log("Seeding users for demo organizations...\n");

    // Ensure users table exists
    const tableCheck = await sql`
      SELECT to_regclass('public.users') as tbl
    `;
    if (!tableCheck[0].tbl) {
      console.error("ERROR: users table does not exist. Run migration 0009 first.");
      process.exit(1);
    }

    const passwordHash = hashPassword(DEV_PASSWORD);

    for (const orgDomain of ORG_DOMAINS) {
      // Find organization by contact_email
      const [org] = await sql<Array<{ id: string; name: string }>>`
        SELECT id, name FROM organizations WHERE contact_email = ${orgDomain.orgContactEmail}
      `;

      if (!org) {
        console.log(`  Skipping ${orgDomain.emailDomain} (org not found)`);
        continue;
      }

      console.log(`${org.name} (${orgDomain.emailDomain}):`);

      for (const template of USER_TEMPLATES) {
        const email = `${template.emailPrefix}@${orgDomain.emailDomain}`;

        // Check if user already exists
        const [existing] = await sql<Array<{ id: string }>>`
          SELECT id FROM users WHERE email = ${email}
        `;

        if (existing) {
          console.log(`  [skip] ${email} (already exists)`);
          continue;
        }

        await sql`
          INSERT INTO users (organization_id, email, password_hash, name, role, is_active)
          VALUES (
            ${org.id},
            ${email},
            ${passwordHash},
            ${template.name},
            ${template.role}::user_role,
            true
          )
        `;
        console.log(`  [created] ${email} (${template.role})`);
      }
    }

    // Summary
    const userCount = await sql<Array<{ count: string }>>`
      SELECT count(*)::text as count FROM users
    `;
    console.log(`\nTotal users: ${userCount[0].count}`);
    console.log("Dev password for all users: SpaceGuard2026!");
  } finally {
    await sql.end();
  }
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
