import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface NIS2Requirement {
  regulation: string;
  articleReference: string;
  title: string;
  category: string;
  description: string;
  evidenceGuidance: string;
  applicabilityNotes?: string;
}

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard";

async function seed() {
  const sql = postgres(connectionString);

  try {
    const raw = readFileSync(
      join(__dirname, "nis2-requirements.json"),
      "utf-8"
    );
    const requirements: NIS2Requirement[] = JSON.parse(raw);

    console.log(`Seeding ${requirements.length} NIS2 requirements...`);

    let inserted = 0;
    let skipped = 0;

    // Insert row by row so postgres.js can bind each parameter individually
    // and we can cast the regulation enum correctly. ON CONFLICT (title) DO
    // NOTHING makes every run idempotent.
    for (const r of requirements) {
      const result = await sql`
        INSERT INTO compliance_requirements
          (regulation, article_reference, title, description,
           evidence_guidance, category, applicability_notes)
        VALUES (
          ${r.regulation}::regulation,
          ${r.articleReference},
          ${r.title},
          ${r.description},
          ${r.evidenceGuidance},
          ${r.category},
          ${r.applicabilityNotes ?? null}
        )
        ON CONFLICT (title) DO NOTHING
        RETURNING id
      `;

      if (result.length > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }

    console.log(
      `Inserted ${inserted} requirements, skipped ${skipped} duplicates.`
    );

    const [{ count }] = await sql<
      [{ count: string }]
    >`SELECT count(*)::text FROM compliance_requirements`;

    console.log(`Total requirements in database: ${count}`);
  } finally {
    await sql.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
