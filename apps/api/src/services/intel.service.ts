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
