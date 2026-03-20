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

    // Insert all rows using ON CONFLICT (title) DO NOTHING for idempotency.
    // The unique constraint on title means re-running this script is always safe.
    const rows = requirements.map((r) => ({
      regulation: r.regulation as
        | "NIS2"
        | "CRA"
        | "EU_SPACE_ACT"
        | "ENISA_SPACE",
      article_reference: r.articleReference,
      title: r.title,
      description: r.description,
      evidence_guidance: r.evidenceGuidance,
      category: r.category,
      applicability_notes: r.applicabilityNotes ?? null,
    }));

    // postgres.js supports bulk insert with array of objects
    const result = await sql`
      INSERT INTO compliance_requirements
        (regulation, article_reference, title, description,
         evidence_guidance, category, applicability_notes)
      SELECT
        r.regulation::regulation,
        r.article_reference,
        r.title,
        r.description,
        r.evidence_guidance,
        r.category,
        r.applicability_notes
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(
        regulation text,
        article_reference text,
        title text,
        description text,
        evidence_guidance text,
        category text,
        applicability_notes text
      )
      ON CONFLICT (title) DO NOTHING
      RETURNING id
    `;

    const inserted = result.length;
    const skipped = requirements.length - inserted;

    console.log(
      `Inserted ${inserted} requirements, skipped ${skipped} duplicates.`
    );

    // Final verification
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
