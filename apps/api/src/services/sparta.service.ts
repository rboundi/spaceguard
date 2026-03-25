/**
 * SPARTA Service
 *
 * Provides:
 *  - importSpartaBundle  - parse and upsert a STIX 2.1 bundle into threat_intel
 *  - fetchFromServer     - fetch latest STIX bundle from sparta.aerospace.org
 *  - getSpartaStatus     - current SPARTA data stats + recent imports
 */

import { eq, desc, count, sql, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { threatIntel } from "../db/schema/intel";
import { spartaImportHistory, adminSettings } from "../db/schema/sparta";
import type { StixBundle, SpartaImportDiff, SpartaStatus } from "@spaceguard/shared";
import { stixBundleSchema } from "@spaceguard/shared";
import type { SpartaImportSource } from "@spaceguard/shared";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic hash of a STIX object to detect changes */
function hashStixObject(obj: Record<string, unknown>): string {
  // Use id + modified + name + description as the change fingerprint.
  // The full JSON hash would be too expensive and also catches
  // irrelevant timestamp-only changes from the server.
  const parts = [
    String(obj["id"] ?? ""),
    String(obj["modified"] ?? ""),
    String(obj["name"] ?? ""),
    String(obj["description"] ?? ""),
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Extract SPARTA version from x-sparta-collection object in bundle */
function extractVersion(bundle: StixBundle): string | null {
  const collection = bundle.objects.find(
    (o) => o.type === "x-sparta-collection"
  );
  if (!collection) return null;
  const obj = collection as Record<string, unknown>;
  return typeof obj["x_sparta_version"] === "string"
    ? obj["x_sparta_version"]
    : null;
}

/** Map a STIX object type to its category for diff tracking */
type DiffCategory = "techniques" | "countermeasures" | "indicators" | "relationships";

function categorize(stixType: string): DiffCategory | null {
  switch (stixType) {
    case "attack-pattern":
      return "techniques";
    case "course-of-action":
      return "countermeasures";
    case "indicator":
      return "indicators";
    case "relationship":
      return "relationships";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// importSpartaBundle
// ---------------------------------------------------------------------------

interface ImportOptions {
  source: SpartaImportSource;
  fileName?: string;
}

export async function importSpartaBundle(
  rawBundle: unknown,
  options: ImportOptions
): Promise<SpartaImportDiff> {
  // 1. Validate bundle structure
  const parseResult = stixBundleSchema.safeParse(rawBundle);
  if (!parseResult.success) {
    throw new HTTPException(422, {
      message: "Invalid STIX 2.1 bundle structure",
      cause: parseResult.error.flatten(),
    });
  }
  const bundle = parseResult.data;

  // 2. Extract version
  const version = extractVersion(bundle);

  // 3. Filter to importable STIX types
  const importableTypes = new Set([
    "attack-pattern",
    "course-of-action",
    "indicator",
    "relationship",
  ]);
  const objects = bundle.objects.filter((o) => importableTypes.has(o.type));

  if (objects.length === 0) {
    throw new HTTPException(422, {
      message: "Bundle contains no importable STIX objects (attack-pattern, course-of-action, indicator, relationship)",
    });
  }

  // 4. Fetch existing records for comparison (by stixId)
  const stixIds = objects.map((o) => o.id);
  // Batch fetch in chunks of 500 to avoid query size limits
  const existingMap = new Map<string, { stixId: string; hash: string }>();
  for (let i = 0; i < stixIds.length; i += 500) {
    const chunk = stixIds.slice(i, i + 500);
    const existing = await db
      .select({ stixId: threatIntel.stixId, data: threatIntel.data })
      .from(threatIntel)
      .where(inArray(threatIntel.stixId, chunk));
    for (const row of existing) {
      existingMap.set(row.stixId, {
        stixId: row.stixId,
        hash: hashStixObject(row.data as Record<string, unknown>),
      });
    }
  }

  // 5. Classify each object as added, updated, or unchanged
  const diff: SpartaImportDiff = {
    techniques: { added: 0, updated: 0, unchanged: 0, total: 0 },
    countermeasures: { added: 0, updated: 0, unchanged: 0, total: 0 },
    indicators: { added: 0, updated: 0, unchanged: 0, total: 0 },
    relationships: { added: 0, updated: 0, unchanged: 0, total: 0 },
    version,
    importedAt: new Date().toISOString(),
  };

  const toInsert: Array<{
    stixId: string;
    stixType: string;
    name: string;
    description: string | null;
    data: Record<string, unknown>;
    source: string;
    confidence: number | null;
  }> = [];
  const toUpdate: Array<{
    stixId: string;
    name: string;
    description: string | null;
    data: Record<string, unknown>;
    confidence: number | null;
  }> = [];

  for (const obj of objects) {
    const category = categorize(obj.type);
    if (!category) continue;

    diff[category].total++;

    const stixObj = obj as Record<string, unknown>;
    const newHash = hashStixObject(stixObj);
    const existing = existingMap.get(obj.id);

    const name = typeof stixObj["name"] === "string" ? stixObj["name"] : obj.type;
    const description = typeof stixObj["description"] === "string"
      ? stixObj["description"]
      : null;
    const confidence = typeof stixObj["confidence"] === "number"
      ? stixObj["confidence"]
      : null;

    if (!existing) {
      diff[category].added++;
      toInsert.push({
        stixId: obj.id,
        stixType: obj.type,
        name,
        description,
        data: stixObj,
        source: "SPARTA",
        confidence,
      });
    } else if (existing.hash !== newHash) {
      diff[category].updated++;
      toUpdate.push({
        stixId: obj.id,
        name,
        description,
        data: stixObj,
        confidence,
      });
    } else {
      diff[category].unchanged++;
    }
  }

  // 6. Batch upsert - inserts
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      await db
        .insert(threatIntel)
        .values(
          batch.map((item) => ({
            stixId: item.stixId,
            stixType: item.stixType,
            name: item.name,
            description: item.description,
            data: item.data,
            source: item.source,
            confidence: item.confidence,
          }))
        )
        .onConflictDoUpdate({
          target: threatIntel.stixId,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            data: sql`excluded.data`,
            source: sql`excluded.source`,
            confidence: sql`excluded.confidence`,
            updatedAt: new Date(),
          },
        });
    }
  }

  // 7. Batch update - changed records
  for (const item of toUpdate) {
    await db
      .update(threatIntel)
      .set({
        name: item.name,
        description: item.description,
        data: item.data,
        confidence: item.confidence,
        updatedAt: new Date(),
      })
      .where(eq(threatIntel.stixId, item.stixId));
  }

  // 8. Record import in audit history
  await db.insert(spartaImportHistory).values({
    source: options.source,
    fileName: options.fileName ?? null,
    version,
    techniquesAdded: diff.techniques.added,
    techniquesUpdated: diff.techniques.updated,
    techniquesUnchanged: diff.techniques.unchanged,
    countermeasuresAdded: diff.countermeasures.added,
    countermeasuresUpdated: diff.countermeasures.updated,
    countermeasuresUnchanged: diff.countermeasures.unchanged,
    indicatorsAdded: diff.indicators.added,
    indicatorsUpdated: diff.indicators.updated,
    indicatorsUnchanged: diff.indicators.unchanged,
    relationshipsAdded: diff.relationships.added,
    relationshipsUpdated: diff.relationships.updated,
    relationshipsUnchanged: diff.relationships.unchanged,
    totalObjects: objects.length,
  });

  return diff;
}

// ---------------------------------------------------------------------------
// Admin Settings helpers
// ---------------------------------------------------------------------------

const SPARTA_URL_KEY = "sparta_fetch_url";
const DEFAULT_SPARTA_URL = "https://sparta.aerospace.org/download/STIX?f=latest";

export async function getSpartaUrl(): Promise<string> {
  const row = await db
    .select({ value: adminSettings.value })
    .from(adminSettings)
    .where(eq(adminSettings.key, SPARTA_URL_KEY))
    .limit(1);
  return row[0]?.value ?? DEFAULT_SPARTA_URL;
}

export async function setSpartaUrl(url: string): Promise<string> {
  await db
    .insert(adminSettings)
    .values({ key: SPARTA_URL_KEY, value: url, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: adminSettings.key,
      set: { value: url, updatedAt: new Date() },
    });
  return url;
}

// ---------------------------------------------------------------------------
// checkDuplicates
// ---------------------------------------------------------------------------

export interface DuplicateCheckResult {
  totalRecords: number;
  duplicateGroups: number;
  duplicateRows: number;
  details: Array<{ stixId: string; count: number }>;
  cleaned: boolean;
  deletedCount: number;
}

export async function checkDuplicates(
  autoClean: boolean
): Promise<DuplicateCheckResult> {
  // Count total records
  const totalResult = await db
    .select({ cnt: count() })
    .from(threatIntel);
  const totalRecords = Number(totalResult[0]?.cnt ?? 0);

  // Find duplicate stix_id values
  const dupes = await db.execute<{ stix_id: string; cnt: number }>(
    sql`SELECT stix_id, COUNT(*)::int AS cnt
        FROM threat_intel
        GROUP BY stix_id
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 50`
  );

  // postgres.js returns an array directly (no .rows wrapper)
  const dupeRows = Array.isArray(dupes) ? dupes : (dupes as unknown as { rows: Array<{ stix_id: string; cnt: number }> }).rows ?? [];
  const details = dupeRows.map(
    (r) => ({ stixId: r.stix_id, count: Number(r.cnt) })
  );

  const duplicateGroups = details.length;
  const duplicateRows = details.reduce((sum, d) => sum + (d.count - 1), 0);

  let deletedCount = 0;

  if (autoClean && duplicateGroups > 0) {
    const result = await db.execute(
      sql`DELETE FROM threat_intel
          WHERE id NOT IN (
            SELECT DISTINCT ON (stix_id) id
            FROM threat_intel
            ORDER BY stix_id, updated_at DESC
          )`
    );
    // postgres.js: result is an array with a .count property
    const raw = result as unknown as { count?: number; rowCount?: number };
    deletedCount = Number(raw.count ?? raw.rowCount ?? 0);
  }

  return {
    totalRecords,
    duplicateGroups,
    duplicateRows,
    details,
    cleaned: autoClean && duplicateGroups > 0,
    deletedCount,
  };
}

// ---------------------------------------------------------------------------
// fetchFromServer
// ---------------------------------------------------------------------------

export async function fetchFromServer(
  url?: string
): Promise<SpartaImportDiff> {
  // Use explicit URL, or look up the saved URL, or fall back to default
  const targetUrl = url ?? await getSpartaUrl();

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new HTTPException(502, {
      message: `Failed to fetch from SPARTA server: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }

  if (!response.ok) {
    throw new HTTPException(502, {
      message: `SPARTA server returned ${response.status} ${response.statusText}`,
    });
  }

  let rawBundle: unknown;
  try {
    rawBundle = await response.json();
  } catch {
    throw new HTTPException(502, {
      message: "SPARTA server returned invalid JSON",
    });
  }

  return importSpartaBundle(rawBundle, { source: "SERVER_FETCH" });
}

// ---------------------------------------------------------------------------
// getSpartaStatus
// ---------------------------------------------------------------------------

export async function getSpartaStatus(): Promise<SpartaStatus> {
  // Count STIX objects by type (from threat_intel table, source = SPARTA)
  const countsByType = await db
    .select({
      stixType: threatIntel.stixType,
      cnt: count(),
    })
    .from(threatIntel)
    .where(eq(threatIntel.source, "SPARTA"))
    .groupBy(threatIntel.stixType);

  const countsMap: Record<string, number> = {};
  let total = 0;
  for (const row of countsByType) {
    countsMap[row.stixType] = Number(row.cnt);
    total += Number(row.cnt);
  }

  // Recent imports (last 10)
  const recentImports = await db
    .select()
    .from(spartaImportHistory)
    .orderBy(desc(spartaImportHistory.createdAt))
    .limit(10);

  const latestImport = recentImports[0] ?? null;

  return {
    version: latestImport?.version ?? null,
    lastImportedAt: latestImport?.createdAt?.toISOString() ?? null,
    lastImportSource: latestImport?.source ?? null,
    counts: {
      attackPatterns: countsMap["attack-pattern"] ?? 0,
      courseOfActions: countsMap["course-of-action"] ?? 0,
      indicators: countsMap["indicator"] ?? 0,
      relationships: countsMap["relationship"] ?? 0,
      total,
    },
    recentImports: recentImports.map((r) => ({
      id: r.id,
      source: r.source,
      version: r.version,
      techniquesAdded: r.techniquesAdded,
      techniquesUpdated: r.techniquesUpdated,
      countermeasuresAdded: r.countermeasuresAdded,
      countermeasuresUpdated: r.countermeasuresUpdated,
      importedAt: r.createdAt.toISOString(),
    })),
  };
}
