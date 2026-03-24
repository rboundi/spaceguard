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

interface SpartaTechnique {
  stix_id: string;
  stix_type: string;
  name: string;
  description: string;
  tactic: string;
  sparta_id: string;
  related_nis2_articles: string[];
  detection_guidance: string;
  mitigation_guidance: string;
  confidence: number;
  source: string;
}

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard";

// ---------------------------------------------------------------------------
// Seed NIS2 requirements
// ---------------------------------------------------------------------------

async function seedNis2Requirements(sql: postgres.Sql): Promise<void> {
  const raw = readFileSync(
    join(__dirname, "nis2-requirements.json"),
    "utf-8"
  );
  const requirements: NIS2Requirement[] = JSON.parse(raw);

  console.log(`\nSeeding ${requirements.length} NIS2 requirements...`);

  let inserted = 0;
  let skipped = 0;

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
    `  Inserted ${inserted} requirements, skipped ${skipped} duplicates.`
  );

  const [{ count }] = await sql<
    [{ count: string }]
  >`SELECT count(*)::text FROM compliance_requirements`;

  console.log(`  Total requirements in database: ${count}`);
}

// ---------------------------------------------------------------------------
// Seed SPARTA techniques
// ---------------------------------------------------------------------------

async function seedSpartaTechniques(sql: postgres.Sql): Promise<void> {
  const raw = readFileSync(
    join(__dirname, "sparta-techniques.json"),
    "utf-8"
  );
  const techniques: SpartaTechnique[] = JSON.parse(raw);

  console.log(`\nSeeding ${techniques.length} SPARTA techniques...`);

  let inserted = 0;
  let updated = 0;

  for (const t of techniques) {
    // Build a complete STIX 2.1 attack-pattern object with SpaceGuard
    // extension fields prefixed x_ for the mitigation and detection guidance.
    const stixObject = {
      type:                  t.stix_type,
      spec_version:          "2.1",
      id:                    t.stix_id,
      name:                  t.name,
      description:           t.description,
      created:               "2024-01-01T00:00:00.000Z",
      modified:              "2024-01-01T00:00:00.000Z",
      confidence:            t.confidence,
      // SpaceGuard extension fields
      x_sparta_tactic:       t.tactic,
      x_sparta_id:           t.sparta_id,
      x_related_nis2:        t.related_nis2_articles,
      x_detection_guidance:  t.detection_guidance,
      x_mitigation_guidance: t.mitigation_guidance,
      kill_chain_phases: [
        {
          kill_chain_name: "sparta",
          phase_name:      t.tactic.toLowerCase().replace(/\s+/g, "-"),
        },
      ],
    };

    const result = await sql`
      INSERT INTO threat_intel
        (stix_id, stix_type, name, description, data, source, confidence)
      VALUES (
        ${t.stix_id},
        ${t.stix_type},
        ${t.name},
        ${t.description},
        ${sql.json(stixObject)},
        ${t.source},
        ${t.confidence}
      )
      ON CONFLICT (stix_id) DO UPDATE
        SET name        = EXCLUDED.name,
            description = EXCLUDED.description,
            data        = EXCLUDED.data,
            confidence  = EXCLUDED.confidence,
            updated_at  = now()
      RETURNING id, (xmax = 0) AS is_insert
    `;

    if (result.length > 0 && result[0].is_insert) {
      inserted++;
    } else {
      updated++;
    }
  }

  console.log(
    `  Inserted ${inserted} new techniques, updated ${updated} existing.`
  );

  const [{ count }] = await sql<
    [{ count: string }]
  >`SELECT count(*)::text FROM threat_intel WHERE source = 'SPARTA'`;

  console.log(`  Total SPARTA techniques in database: ${count}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  const sql = postgres(connectionString);

  try {
    await seedNis2Requirements(sql);
    await seedSpartaTechniques(sql);

    console.log("\nSeed complete.");
  } finally {
    await sql.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
