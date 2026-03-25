/**
 * Intel Service
 *
 * Provides:
 *  - listIntel        - paginated list with filters (type, source, tactic, full-text)
 *  - getIntel         - fetch single intel object by SpaceGuard ID
 *  - createIntel      - manually insert a STIX object
 *  - enrichAlert      - given an alert's SPARTA fields, return matching intel + context
 *  - searchIntel      - free-text search across name + description
 */

import { eq, and, ilike, or, desc, count, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { threatIntel } from "../db/schema/intel";
import type { ThreatIntel } from "../db/schema/intel";
import { alerts } from "../db/schema/alerts";
import type {
  IntelResponse,
  CreateIntel,
  IntelQuery,
  AlertEnrichment,
} from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Response mapper
// ---------------------------------------------------------------------------

function intelToResponse(row: ThreatIntel): IntelResponse {
  return {
    id:          row.id,
    stixId:      row.stixId,
    stixType:    row.stixType,
    name:        row.name,
    description: row.description ?? null,
    data:        row.data as Record<string, unknown>,
    source:      row.source,
    confidence:  row.confidence ?? null,
    validFrom:   row.validFrom?.toISOString() ?? null,
    validUntil:  row.validUntil?.toISOString() ?? null,
    createdAt:   row.createdAt.toISOString(),
    updatedAt:   row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// listIntel
// ---------------------------------------------------------------------------

export async function listIntel(
  query: IntelQuery
): Promise<{ data: IntelResponse[]; total: number }> {
  const page    = query.page    ?? 1;
  const perPage = query.perPage ?? 20;
  const offset  = (page - 1) * perPage;

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [];

  if (query.stixType) {
    conditions.push(eq(threatIntel.stixType, query.stixType));
  }

  if (query.source) {
    conditions.push(eq(threatIntel.source, query.source));
  }

  // Tactic filter: SPARTA stores tactic in data->>'x_sparta_tactic'
  if (query.tactic) {
    // Use Drizzle sql`` to do a JSONB text extraction comparison
    conditions.push(
      sql`(${threatIntel.data}->>'x_sparta_tactic') ILIKE ${`%${query.tactic}%`}` as ReturnType<typeof eq>
    );
  }

  // Free-text search against name OR description
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(
      or(
        ilike(threatIntel.name, pattern),
        ilike(threatIntel.description, pattern)
      ) as ReturnType<typeof eq>
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(threatIntel)
      .where(where)
      .orderBy(desc(threatIntel.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ total: count() }).from(threatIntel).where(where),
  ]);

  return { data: rows.map(intelToResponse), total: Number(total) };
}

// ---------------------------------------------------------------------------
// getIntel
// ---------------------------------------------------------------------------

export async function getIntel(id: string): Promise<IntelResponse> {
  const [row] = await db
    .select()
    .from(threatIntel)
    .where(eq(threatIntel.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: `Intel object ${id} not found` });
  }

  return intelToResponse(row);
}

// ---------------------------------------------------------------------------
// createIntel
// ---------------------------------------------------------------------------

export async function createIntel(data: CreateIntel): Promise<IntelResponse> {
  // Build a minimal STIX 2.1 wrapper around the provided data
  const stixObject: Record<string, unknown> = {
    type:             data.stixType,
    spec_version:     "2.1",
    id:               data.stixId,
    name:             data.name,
    description:      data.description,
    created:          new Date().toISOString(),
    modified:         new Date().toISOString(),
    confidence:       data.confidence,
    valid_from:       data.validFrom,
    valid_until:      data.validUntil,
    ...data.data,
  };

  const [row] = await db
    .insert(threatIntel)
    .values({
      stixId:      data.stixId,
      stixType:    data.stixType,
      name:        data.name,
      description: data.description ?? null,
      data:        stixObject,
      source:      data.source,
      confidence:  data.confidence ?? null,
      validFrom:   data.validFrom ? new Date(data.validFrom) : null,
      validUntil:  data.validUntil ? new Date(data.validUntil) : null,
    })
    .onConflictDoUpdate({
      target: threatIntel.stixId,
      set: {
        name:        data.name,
        description: data.description ?? null,
        data:        stixObject,
        source:      data.source,
        confidence:  data.confidence ?? null,
        updatedAt:   new Date(),
      },
    })
    .returning();

  return intelToResponse(row);
}

// ---------------------------------------------------------------------------
// enrichAlert
// ---------------------------------------------------------------------------

/**
 * Given an alert ID, look up its SPARTA tactic and technique, find matching
 * STIX attack-pattern objects, and return enrichment context including
 * related mitigations and detection tips extracted from the intel records.
 */
export async function enrichAlert(alertId: string): Promise<AlertEnrichment> {
  // Fetch the alert
  const [alertRow] = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);

  if (!alertRow) {
    throw new HTTPException(404, { message: `Alert ${alertId} not found` });
  }

  const { spartaTactic, spartaTechnique } = alertRow;

  // Find all matching attack-pattern intel objects.
  // Match on tactic name (stored in data->>'x_sparta_tactic') OR
  // technique name (stored in data->>'x_sparta_technique' or the STIX name field).
  const baseCondition = eq(threatIntel.stixType, "attack-pattern");

  // Build optional tactic/technique match conditions
  const matchParts = [];

  if (spartaTactic) {
    matchParts.push(
      sql`(${threatIntel.data}->>'x_sparta_tactic') ILIKE ${`%${spartaTactic}%`}`
    );
  }

  if (spartaTechnique) {
    matchParts.push(
      ilike(threatIntel.name, `%${spartaTechnique}%`),
      sql`(${threatIntel.data}->>'x_sparta_technique') ILIKE ${`%${spartaTechnique}%`}`
    );
  }

  // Combine: always require attack-pattern type; optionally match on tactic/technique
  const whereClause =
    matchParts.length > 0
      ? and(baseCondition, or(...matchParts))
      : baseCondition;

  const matchedRows = await db
    .select()
    .from(threatIntel)
    .where(whereClause)
    .orderBy(desc(threatIntel.confidence))
    .limit(10);

  const matchedIntel = matchedRows.map(intelToResponse);

  // Extract mitigations and detection tips from the data jsonb
  const mitigations: string[] = [];
  const detectionTips: string[] = [];
  const relatedTacticsSet = new Set<string>();

  for (const intel of matchedIntel) {
    const d = intel.data as Record<string, unknown>;

    if (typeof d["x_mitigation_guidance"] === "string" && d["x_mitigation_guidance"]) {
      mitigations.push(d["x_mitigation_guidance"]);
    }
    if (typeof d["x_detection_guidance"] === "string" && d["x_detection_guidance"]) {
      detectionTips.push(d["x_detection_guidance"]);
    }
    if (typeof d["x_sparta_tactic"] === "string" && d["x_sparta_tactic"]) {
      relatedTacticsSet.add(d["x_sparta_tactic"]);
    }
  }

  return {
    alertId,
    spartaTactic:    spartaTactic ?? null,
    spartaTechnique: spartaTechnique ?? null,
    matchedIntel,
    relatedTactics:  Array.from(relatedTacticsSet),
    mitigations,
    detectionTips,
  };
}

// ---------------------------------------------------------------------------
// searchIntel
// ---------------------------------------------------------------------------

/**
 * Full-text search across name and description fields.
 * Returns up to 20 results ordered by confidence desc.
 */
export async function searchIntel(
  query: string,
  limit = 20
): Promise<IntelResponse[]> {
  const trimmed = query.trim().slice(0, 500);
  if (!trimmed) return [];

  const pattern = `%${trimmed}%`;

  const rows = await db
    .select()
    .from(threatIntel)
    .where(
      or(
        ilike(threatIntel.name, pattern),
        ilike(threatIntel.description, pattern)
      )
    )
    .orderBy(desc(threatIntel.confidence))
    .limit(limit);

  return rows.map(intelToResponse);
}

// ---------------------------------------------------------------------------
// listTechniques
// ---------------------------------------------------------------------------

/**
 * Return all SPARTA attack-pattern objects for a given tactic.
 * tacticId can be either the tactic STIX ID (x-sparta-tactic--...) or
 * the tactic short name / kill-chain phase name (e.g. "reconnaissance").
 */
export async function listTechniques(
  tacticId: string
): Promise<IntelResponse[]> {
  const trimmed = tacticId.trim().toLowerCase();

  // Match via kill_chain_phases[*].phase_name in the JSONB data
  const rows = await db
    .select()
    .from(threatIntel)
    .where(
      and(
        eq(threatIntel.stixType, "attack-pattern"),
        eq(threatIntel.source, "SPARTA"),
        sql`EXISTS (
          SELECT 1
          FROM jsonb_array_elements(${threatIntel.data}->'kill_chain_phases') AS kc
          WHERE (kc->>'phase_name') ILIKE ${"%" + trimmed + "%"}
             OR (kc->>'phase_name') ILIKE ${trimmed}
        )`
      )
    )
    .orderBy(
      sql`(${threatIntel.data}->>'x_sparta_is_subtechnique')::boolean`,
      threatIntel.name
    );

  return rows.map(intelToResponse);
}

// ---------------------------------------------------------------------------
// searchTechniques
// ---------------------------------------------------------------------------

/**
 * Full-text search restricted to attack-pattern objects, across name and
 * description. Returns up to `limit` results ordered by name.
 */
export async function searchTechniques(
  query: string,
  limit = 20
): Promise<IntelResponse[]> {
  const trimmed = query.trim().slice(0, 500);
  if (!trimmed) return [];

  const pattern = `%${trimmed}%`;

  const rows = await db
    .select()
    .from(threatIntel)
    .where(
      and(
        eq(threatIntel.stixType, "attack-pattern"),
        eq(threatIntel.source, "SPARTA"),
        or(
          ilike(threatIntel.name, pattern),
          ilike(threatIntel.description, pattern)
        )
      )
    )
    .orderBy(threatIntel.name)
    .limit(limit);

  return rows.map(intelToResponse);
}

// ---------------------------------------------------------------------------
// getTechniqueWithCountermeasures
// ---------------------------------------------------------------------------

/**
 * Return a technique by STIX ID or SpaceGuard UUID, together with:
 *   - its sub-techniques (attack-patterns that link back via related-to)
 *   - its mapped countermeasures (course-of-action objects that point to it)
 */
export interface TechniqueDetail {
  technique: IntelResponse;
  subTechniques: IntelResponse[];
  countermeasures: IntelResponse[];
}

export async function getTechniqueWithCountermeasures(
  id: string
): Promise<TechniqueDetail> {
  // Accept either a SpaceGuard UUID or a STIX ID
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const [techniqueRow] = await db
    .select()
    .from(threatIntel)
    .where(
      isUuid
        ? and(eq(threatIntel.id, id), eq(threatIntel.stixType, "attack-pattern"))
        : and(eq(threatIntel.stixId, id), eq(threatIntel.stixType, "attack-pattern"))
    )
    .limit(1);

  if (!techniqueRow) {
    throw new HTTPException(404, {
      message: `Technique ${id} not found`,
    });
  }

  const stixId = techniqueRow.stixId;

  // Find sub-techniques: relationships where target_ref = this technique
  // and the source is also an attack-pattern (subtechnique -> parent)
  const subRows = await db
    .select()
    .from(threatIntel)
    .where(
      and(
        eq(threatIntel.stixType, "attack-pattern"),
        eq(threatIntel.source, "SPARTA"),
        sql`(${threatIntel.data}->>'x_sparta_is_subtechnique')::boolean = true`,
        sql`EXISTS (
          SELECT 1
          FROM threat_intel rel
          WHERE rel.stix_type = 'relationship'
            AND (rel.data->>'relationship_type') = 'related-to'
            AND (rel.data->>'source_ref') = ${threatIntel.stixId}
            AND (rel.data->>'target_ref') = ${stixId}
        )`
      )
    )
    .orderBy(threatIntel.name);

  // Find countermeasures: course-of-action objects whose relationships
  // point (source_ref = course-of-action, target_ref = this technique)
  const cmRows = await db
    .select()
    .from(threatIntel)
    .where(
      and(
        eq(threatIntel.stixType, "course-of-action"),
        eq(threatIntel.source, "SPARTA"),
        sql`EXISTS (
          SELECT 1
          FROM threat_intel rel
          WHERE rel.stix_type = 'relationship'
            AND (rel.data->>'relationship_type') = 'related-to'
            AND (rel.data->>'source_ref') = ${threatIntel.stixId}
            AND (rel.data->>'target_ref') = ${stixId}
        )`
      )
    )
    .orderBy(threatIntel.name);

  return {
    technique: intelToResponse(techniqueRow),
    subTechniques: subRows.map(intelToResponse),
    countermeasures: cmRows.map(intelToResponse),
  };
}

// ---------------------------------------------------------------------------
// getCountermeasures
// ---------------------------------------------------------------------------

/**
 * Return all countermeasures (course-of-action) mapped to a technique STIX ID.
 */
export async function getCountermeasures(
  techniqueStixId: string
): Promise<IntelResponse[]> {
  const rows = await db
    .select()
    .from(threatIntel)
    .where(
      and(
        eq(threatIntel.stixType, "course-of-action"),
        eq(threatIntel.source, "SPARTA"),
        sql`EXISTS (
          SELECT 1
          FROM threat_intel rel
          WHERE rel.stix_type = 'relationship'
            AND (rel.data->>'relationship_type') = 'related-to'
            AND (rel.data->>'source_ref') = ${threatIntel.stixId}
            AND (rel.data->>'target_ref') = ${techniqueStixId}
        )`
      )
    )
    .orderBy(threatIntel.name);

  return rows.map(intelToResponse);
}

// ---------------------------------------------------------------------------
// getCountermeasuresByNist
// ---------------------------------------------------------------------------

/**
 * Find all SPARTA countermeasures that map to a given NIST control ID.
 * NIST control IDs are stored in data->>'x_nist_rev5' or nested in
 * external_references with source_name = 'NIST 800-53'.
 * controlId examples: "AC-2", "SI-3", "SC-7"
 */
export async function getCountermeasuresByNist(
  controlId: string
): Promise<IntelResponse[]> {
  const normalised = controlId.trim().toUpperCase();

  const rows = await db
    .select()
    .from(threatIntel)
    .where(
      and(
        eq(threatIntel.stixType, "course-of-action"),
        eq(threatIntel.source, "SPARTA"),
        or(
          // Check x_nist_rev5 field (string or array)
          sql`(${threatIntel.data}->>'x_nist_rev5') ILIKE ${"%" + normalised + "%"}`,
          // Check external_references array for NIST source
          sql`EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(${threatIntel.data}->'external_references') = 'array'
                THEN ${threatIntel.data}->'external_references'
                ELSE '[]'::jsonb
              END
            ) AS ref
            WHERE (ref->>'source_name') ILIKE '%nist%'
              AND (ref->>'external_id') ILIKE ${normalised + "%"}
          )`
        )
      )
    )
    .orderBy(threatIntel.name);

  return rows.map(intelToResponse);
}
