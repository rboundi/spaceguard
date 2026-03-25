import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { complianceRequirements, threatIntel } from "../db/schema/index";
import { assertUUID } from "../middleware/validate";

export const enisaRoutes = new Hono();

// Type for parsed ENISA metadata from applicability_notes
interface EnisaMetadata {
  lifecyclePhases?: string[];
  segments?: string[];
  threatsAddressed?: string[];
  referenceFrameworks?: string[];
  spartaTechniques?: string[];
  nis2Mapping?: string;
}

// Helper to safely parse JSON metadata from applicability_notes
function parseEnisaMetadata(notesJson: string | null): EnisaMetadata {
  if (!notesJson) return {};
  try {
    return JSON.parse(notesJson) as EnisaMetadata;
  } catch {
    return {};
  }
}

// GET /api/v1/enisa/controls
// Returns all ENISA controls with enriched metadata from applicability_notes
enisaRoutes.get("/enisa/controls", async (c) => {
  const controls = await db
    .select()
    .from(complianceRequirements)
    .where(eq(complianceRequirements.regulation, "ENISA_SPACE"))
    .orderBy(complianceRequirements.category);

  const enriched = controls.map((control) => ({
    id: control.id,
    regulation: control.regulation,
    articleReference: control.articleReference,
    title: control.title,
    description: control.description,
    evidenceGuidance: control.evidenceGuidance,
    category: control.category,
    createdAt: control.createdAt.toISOString(),
    metadata: parseEnisaMetadata(control.applicabilityNotes),
  }));

  return c.json({ data: enriched });
});

// GET /api/v1/enisa/controls/:id/sparta-techniques
// Returns SPARTA techniques (course-of-action) that this ENISA control mitigates
enisaRoutes.get("/enisa/controls/:id/sparta-techniques", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");

  // 1. Get the ENISA control from compliance_requirements
  const [control] = await db
    .select()
    .from(complianceRequirements)
    .where(
      eq(complianceRequirements.id, id)
    )
    .limit(1);

  if (!control) {
    throw new HTTPException(404, {
      message: `ENISA control ${id} not found`,
    });
  }

  if (control.regulation !== "ENISA_SPACE") {
    throw new HTTPException(400, {
      message: `Control ${id} is not an ENISA control`,
    });
  }

  // 2. Parse the metadata to get spartaTechniques array
  const metadata = parseEnisaMetadata(control.applicabilityNotes);
  const spartaTechniqueIds = metadata.spartaTechniques || [];

  if (spartaTechniqueIds.length === 0) {
    return c.json({ data: [] });
  }

  // 3. Query threat_intel for course-of-action (countermeasures) that match these IDs
  // Note: The spartaTechniques are CM-XXXX identifiers (SPARTA countermeasure IDs)
  // We need to find them in the x_mitre_id field within the data JSONB
  const countermeasures = await db
    .select()
    .from(threatIntel)
    .where(eq(threatIntel.stixType, "course-of-action"));

  // Filter to those matching the SPARTA countermeasure IDs
  const matching = countermeasures.filter((cm) => {
    const mitre_id = (cm.data as Record<string, unknown>)?.x_mitre_id as string | undefined;
    return mitre_id && spartaTechniqueIds.includes(mitre_id);
  });

  return c.json({
    data: matching.map((cm) => ({
      id: cm.id,
      stixId: cm.stixId,
      name: cm.name,
      description: cm.description,
      data: cm.data,
    })),
  });
});

// GET /api/v1/enisa/sparta-mapping
// Returns bidirectional mapping: for each SPARTA technique, which ENISA controls address it
enisaRoutes.get("/enisa/sparta-mapping", async (c) => {
  // 1. Get all ENISA controls with their SPARTA technique mappings
  const enisaControls = await db
    .select()
    .from(complianceRequirements)
    .where(eq(complianceRequirements.regulation, "ENISA_SPACE"));

  // 2. Build a mapping: spartaTechniqueId -> [list of control articleReferences/titles]
  const spartaToEnisa: Record<string, Array<{ articleReference: string; title: string; controlId: string }>> = {};

  for (const control of enisaControls) {
    const metadata = parseEnisaMetadata(control.applicabilityNotes);
    const spartaTechniques = metadata.spartaTechniques || [];

    for (const techniqueId of spartaTechniques) {
      if (!spartaToEnisa[techniqueId]) {
        spartaToEnisa[techniqueId] = [];
      }
      spartaToEnisa[techniqueId]!.push({
        articleReference: control.articleReference,
        title: control.title,
        controlId: control.id,
      });
    }
  }

  return c.json({ data: spartaToEnisa });
});
