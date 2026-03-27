import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NIS2Requirement {
  regulation: string;
  articleReference: string;
  title: string;
  category: string;
  description: string;
  evidenceGuidance: string;
  applicabilityNotes?: string;
}

interface CraRequirement {
  regulation: string;
  articleReference: string;
  title: string;
  category: string;
  description: string;
  evidenceGuidance: string;
  applicabilityNotes?: string;
  spartaCountermeasures?: string[];
}

interface EnisaControl {
  regulation: string;
  articleReference: string;
  title: string;
  category: string;
  description: string;
  controlStatement: string;
  evidenceGuidance: string;
  applicabilityNotes?: string;
  lifecyclePhases: string[];
  segments: string[];
  threatsAddressed: string[];
  referenceFrameworks: string[];
  spartaTechniques: string[];
  nis2Mapping?: string;
}

interface SpartaTactic {
  id: string;
  type: string;
  name: string;
  short_name: string;
  description: string;
  parent_technique_count: number;
  total_technique_count: number;
  parent_technique_ids: string[];
}

interface SpartaTechnique {
  type: "attack-pattern";
  id: string;
  created: string;
  modified: string;
  name: string;
  x_mitre_id: string;
  description: string;
  kill_chain_phases: Array<{ kill_chain_name: string; phase_name: string }>;
  x_sparta_is_subtechnique: boolean;
  [key: string]: unknown;
}

interface SpartaCountermeasure {
  type: "course-of-action";
  id: string;
  created: string;
  modified: string;
  name: string;
  x_mitre_id: string;
  description: string;
  x_sparta_category: string;
  x_sparta_deployment: string;
  x_category?: string;
  x_cm_tiering?: unknown;
  [key: string]: unknown;
}

interface SpartaIndicator {
  type: "indicator";
  id: string;
  created: string;
  modified: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

interface SpartaRelationship {
  type: "relationship";
  id: string;
  created: string;
  modified: string;
  relationship_type: string;
  source_ref: string;
  target_ref: string;
}

interface SpartaFullMatrix {
  version: string;
  generated: string;
  source: string;
  statistics: {
    tactics: number;
    parent_techniques: number;
    sub_techniques: number;
    total_techniques: number;
    countermeasures: number;
    indicators: number;
    relationships: number;
  };
  tactics: SpartaTactic[];
  techniques: SpartaTechnique[];
  countermeasures: SpartaCountermeasure[];
  indicators: SpartaIndicator[];
  relationships: SpartaRelationship[];
}

interface SpartaCountermeasuresFile {
  version: string;
  countermeasures: SpartaCountermeasure[];
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

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
// Seed CRA requirements
// ---------------------------------------------------------------------------

async function seedCraRequirements(sql: postgres.Sql): Promise<void> {
  const raw = readFileSync(
    join(__dirname, "cra-requirements.json"),
    "utf-8"
  );
  const requirements: CraRequirement[] = JSON.parse(raw);

  console.log(`\nSeeding ${requirements.length} CRA requirements...`);

  let inserted = 0;
  let skipped = 0;

  for (const r of requirements) {
    // Pack SPARTA countermeasure mappings into applicability_notes metadata
    // following the same pattern used by ENISA controls
    const metadata: Record<string, unknown> = {};
    if (r.applicabilityNotes) metadata.notes = r.applicabilityNotes;
    if (r.spartaCountermeasures && r.spartaCountermeasures.length > 0) {
      metadata.spartaCountermeasures = r.spartaCountermeasures;
    }
    const hasMetadata = Object.keys(metadata).length > 0;
    const applicabilityNotes = hasMetadata
      ? JSON.stringify(metadata, null, 2)
      : null;

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
        ${applicabilityNotes}
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
    `  Inserted ${inserted} CRA requirements, skipped ${skipped} duplicates.`
  );

  const [{ count }] = await sql<
    [{ count: string }]
  >`SELECT count(*)::text FROM compliance_requirements WHERE regulation = 'CRA'`;

  console.log(`  Total CRA requirements in database: ${count}`);
}

// ---------------------------------------------------------------------------
// Seed ENISA controls
// ---------------------------------------------------------------------------

async function seedEnisaControls(sql: postgres.Sql): Promise<void> {
  const raw = readFileSync(
    join(__dirname, "enisa-controls.json"),
    "utf-8"
  );
  const controls: EnisaControl[] = JSON.parse(raw);

  console.log(`\nSeeding ${controls.length} ENISA controls...`);

  let inserted = 0;
  let skipped = 0;

  for (const control of controls) {
    // Pack metadata into JSON string for applicability_notes
    const metadata = {
      lifecyclePhases: control.lifecyclePhases,
      segments: control.segments,
      threatsAddressed: control.threatsAddressed,
      referenceFrameworks: control.referenceFrameworks,
      spartaTechniques: control.spartaTechniques,
      nis2Mapping: control.nis2Mapping,
    };
    const metadataJson = JSON.stringify(metadata, null, 2);

    const result = await sql`
      INSERT INTO compliance_requirements
        (regulation, article_reference, title, description,
         evidence_guidance, category, applicability_notes)
      VALUES (
        ${'ENISA_SPACE'}::regulation,
        ${control.articleReference},
        ${control.title},
        ${control.description},
        ${control.evidenceGuidance},
        ${control.category},
        ${metadataJson}
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
    `  Inserted ${inserted} ENISA controls, skipped ${skipped} duplicates.`
  );

  const [{ enisaCount }] = await sql<
    [{ enisaCount: string }]
  >`SELECT count(*)::text FROM compliance_requirements WHERE regulation = 'ENISA_SPACE'`;

  console.log(`  Total ENISA controls in database: ${enisaCount}`);
}

// ---------------------------------------------------------------------------
// Seed SPARTA full matrix
// ---------------------------------------------------------------------------

/**
 * Upsert a batch of threat_intel rows. Returns [inserted, updated] counts.
 */
async function upsertBatch(
  sql: postgres.Sql,
  rows: Array<{
    stixId: string;
    stixType: string;
    name: string;
    description: string | null;
    data: unknown;
    source: string;
    confidence: number | null;
  }>
): Promise<[number, number]> {
  if (rows.length === 0) return [0, 0];

  // Split into chunks of 100 to avoid parameter limits
  let totalInserted = 0;
  let totalUpdated = 0;

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);

    for (const row of chunk) {
      const result = await sql`
        INSERT INTO threat_intel
          (stix_id, stix_type, name, description, data, source, confidence)
        VALUES (
          ${row.stixId},
          ${row.stixType},
          ${row.name},
          ${row.description},
          ${sql.json(row.data as Record<string, unknown>)},
          ${row.source},
          ${row.confidence}
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
        totalInserted++;
      } else {
        totalUpdated++;
      }
    }
  }

  return [totalInserted, totalUpdated];
}

async function seedSpartaFullMatrix(sql: postgres.Sql): Promise<void> {
  console.log("\nLoading SPARTA full matrix from sparta-full-matrix.json...");

  const raw = readFileSync(
    join(__dirname, "sparta-full-matrix.json"),
    "utf-8"
  );
  const matrix: SpartaFullMatrix = JSON.parse(raw);

  const { statistics } = matrix;
  console.log(
    `  Matrix v${matrix.version}: ${statistics.tactics} tactics, ` +
    `${statistics.parent_techniques} parent techniques, ` +
    `${statistics.sub_techniques} sub-techniques, ` +
    `${statistics.countermeasures} countermeasures, ` +
    `${statistics.indicators} indicators, ` +
    `${statistics.relationships} relationships`
  );

  // Fix x_sparta_is_subtechnique in place: the field is unreliable in the data.
  // Sub-techniques are definitively identified by a dot in x_mitre_id (e.g. "REC-0001.01").
  for (const t of matrix.techniques) {
    const isSubtechnique = typeof t.x_mitre_id === "string" && t.x_mitre_id.includes(".");
    t.x_sparta_is_subtechnique = isSubtechnique;
  }

  // Also load enriched countermeasures (has NIST/ISO mappings from the Excel)
  let enrichedCmMap: Map<string, SpartaCountermeasure> = new Map();
  try {
    const cmRaw = readFileSync(
      join(__dirname, "sparta-countermeasures.json"),
      "utf-8"
    );
    const cmFile: SpartaCountermeasuresFile = JSON.parse(cmRaw);
    for (const cm of cmFile.countermeasures) {
      enrichedCmMap.set(cm.id, cm);
    }
    console.log(`  Loaded ${enrichedCmMap.size} enriched countermeasures`);
  } catch {
    console.log("  Note: sparta-countermeasures.json not found, using matrix data only");
    enrichedCmMap = new Map();
  }

  // -----------------------------------------------------------------------
  // 1. Tactics (stored as x-sparta-tactic custom STIX objects)
  // -----------------------------------------------------------------------
  console.log(`\n  Seeding ${matrix.tactics.length} tactics...`);

  const tacticRows = matrix.tactics.map((tactic) => ({
    stixId: tactic.id,
    stixType: "x-sparta-tactic",
    name: tactic.name,
    description: tactic.description,
    data: {
      type: tactic.type,
      id: tactic.id,
      name: tactic.name,
      short_name: tactic.short_name,
      description: tactic.description,
      parent_technique_count: tactic.parent_technique_count,
      total_technique_count: tactic.total_technique_count,
      parent_technique_ids: tactic.parent_technique_ids,
    },
    source: "SPARTA",
    confidence: null,
  }));

  const [tacInserted, tacUpdated] = await upsertBatch(sql, tacticRows);
  console.log(`  Tactics: ${tacInserted} inserted, ${tacUpdated} updated`);

  // -----------------------------------------------------------------------
  // 2. Techniques (attack-pattern) - parents and sub-techniques
  // -----------------------------------------------------------------------
  const parentTechniques = matrix.techniques.filter(
    (t) => !t.x_sparta_is_subtechnique
  );
  const subTechniques = matrix.techniques.filter(
    (t) => t.x_sparta_is_subtechnique
  );

  console.log(
    `\n  Seeding ${parentTechniques.length} parent techniques...`
  );

  const parentRows = parentTechniques.map((t) => ({
    stixId: t.id,
    stixType: "attack-pattern",
    name: t.name,
    description: t.description ?? null,
    data: t,
    source: "SPARTA",
    confidence: null,
  }));

  const [parentInserted, parentUpdated] = await upsertBatch(sql, parentRows);
  console.log(
    `  Parent techniques: ${parentInserted} inserted, ${parentUpdated} updated`
  );

  console.log(
    `\n  Seeding ${subTechniques.length} sub-techniques...`
  );

  const subRows = subTechniques.map((t) => ({
    stixId: t.id,
    stixType: "attack-pattern",
    name: t.name,
    description: t.description ?? null,
    data: t,
    source: "SPARTA",
    confidence: null,
  }));

  const [subInserted, subUpdated] = await upsertBatch(sql, subRows);
  console.log(
    `  Sub-techniques: ${subInserted} inserted, ${subUpdated} updated`
  );

  // -----------------------------------------------------------------------
  // 3. Countermeasures (course-of-action) - merge with enriched data
  // -----------------------------------------------------------------------
  console.log(
    `\n  Seeding ${matrix.countermeasures.length} countermeasures...`
  );

  const cmRows = matrix.countermeasures.map((cm) => {
    // Merge enriched data (NIST/ISO mappings) if available
    const enriched = enrichedCmMap.get(cm.id);
    const merged = enriched ? { ...cm, ...enriched } : cm;

    return {
      stixId: cm.id,
      stixType: "course-of-action",
      name: cm.name,
      description: cm.description ?? null,
      data: merged,
      source: "SPARTA",
      confidence: null,
    };
  });

  const [cmInserted, cmUpdated] = await upsertBatch(sql, cmRows);
  console.log(
    `  Countermeasures: ${cmInserted} inserted, ${cmUpdated} updated`
  );

  // -----------------------------------------------------------------------
  // 4. Indicators
  // -----------------------------------------------------------------------
  console.log(
    `\n  Seeding ${matrix.indicators.length} indicators...`
  );

  const indicatorRows = matrix.indicators.map((ind) => ({
    stixId: ind.id,
    stixType: "indicator",
    name: ind.name ?? `Indicator ${ind.id}`,
    description: (ind.description as string | undefined) ?? null,
    data: ind,
    source: "SPARTA",
    confidence: null,
  }));

  const [indInserted, indUpdated] = await upsertBatch(sql, indicatorRows);
  console.log(
    `  Indicators: ${indInserted} inserted, ${indUpdated} updated`
  );

  // -----------------------------------------------------------------------
  // 5. Relationships
  // -----------------------------------------------------------------------
  console.log(
    `\n  Seeding ${matrix.relationships.length} relationships...`
  );

  const relRows = matrix.relationships.map((rel) => ({
    stixId: rel.id,
    stixType: "relationship",
    name: `${rel.relationship_type}: ${rel.source_ref} -> ${rel.target_ref}`,
    description: null,
    data: rel,
    source: "SPARTA",
    confidence: null,
  }));

  const [relInserted, relUpdated] = await upsertBatch(sql, relRows);
  console.log(
    `  Relationships: ${relInserted} inserted, ${relUpdated} updated`
  );

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  const [{ spartaCount }] = await sql<
    [{ spartaCount: string }]
  >`SELECT count(*)::text AS "spartaCount" FROM threat_intel WHERE source = 'SPARTA'`;

  console.log(`\n  SPARTA load complete.`);
  console.log(`  Total SPARTA objects in database: ${spartaCount}`);
  console.log(
    `  Loaded: ${tacticRows.length} tactics, ` +
    `${parentTechniques.length} parent techniques, ` +
    `${subTechniques.length} sub-techniques, ` +
    `${cmRows.length} countermeasures, ` +
    `${indicatorRows.length} indicators, ` +
    `${relRows.length} relationships`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  const sql = postgres(connectionString);

  try {
    await seedNis2Requirements(sql);
    await seedCraRequirements(sql);
    await seedEnisaControls(sql);
    await seedSpartaFullMatrix(sql);

    console.log("\nSeed complete.");
  } finally {
    await sql.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
