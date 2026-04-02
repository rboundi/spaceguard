import { eq, and, count, sql, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { cryptoInventory } from "../db/schema/index";
import type { CryptoEntry } from "../db/schema/crypto";

// ---------------------------------------------------------------------------
// Response mapper
// ---------------------------------------------------------------------------

function toResponse(row: CryptoEntry) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assetId: row.assetId,
    name: row.name,
    mechanismType: row.mechanismType,
    algorithm: row.algorithm,
    keyLengthBits: row.keyLengthBits,
    protocol: row.protocol,
    implementation: row.implementation,
    pqcVulnerable: row.pqcVulnerable,
    pqcMigrationStatus: row.pqcMigrationStatus,
    keyLastRotated: row.keyLastRotated,
    keyRotationIntervalDays: row.keyRotationIntervalDays,
    keyNextRotation: row.keyNextRotation,
    certificateExpiry: row.certificateExpiry,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createCryptoEntry(data: {
  organizationId: string;
  assetId?: string | null;
  name: string;
  mechanismType: string;
  algorithm: string;
  keyLengthBits?: number | null;
  protocol?: string | null;
  implementation?: string | null;
  pqcVulnerable?: boolean;
  pqcMigrationStatus?: string;
  keyLastRotated?: string | null;
  keyRotationIntervalDays?: number | null;
  keyNextRotation?: string | null;
  certificateExpiry?: string | null;
  status?: string;
  notes?: string | null;
}) {
  const [row] = await db
    .insert(cryptoInventory)
    .values({
      organizationId: data.organizationId,
      assetId: data.assetId ?? null,
      name: data.name,
      mechanismType: data.mechanismType as CryptoEntry["mechanismType"],
      algorithm: data.algorithm,
      keyLengthBits: data.keyLengthBits ?? null,
      protocol: data.protocol ?? null,
      implementation: data.implementation ?? null,
      pqcVulnerable: data.pqcVulnerable ?? false,
      pqcMigrationStatus: (data.pqcMigrationStatus ?? "NOT_APPLICABLE") as CryptoEntry["pqcMigrationStatus"],
      keyLastRotated: data.keyLastRotated ?? null,
      keyRotationIntervalDays: data.keyRotationIntervalDays ?? null,
      keyNextRotation: data.keyNextRotation ?? null,
      certificateExpiry: data.certificateExpiry ?? null,
      status: (data.status ?? "ACTIVE") as CryptoEntry["status"],
      notes: data.notes ?? null,
    })
    .returning();
  return toResponse(row);
}

export async function listCryptoEntries(organizationId: string) {
  const rows = await db
    .select()
    .from(cryptoInventory)
    .where(eq(cryptoInventory.organizationId, organizationId))
    .orderBy(cryptoInventory.name);
  return rows.map(toResponse);
}

export async function getCryptoEntry(id: string) {
  const [row] = await db
    .select()
    .from(cryptoInventory)
    .where(eq(cryptoInventory.id, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: `Crypto entry ${id} not found` });
  return toResponse(row);
}

export async function deleteCryptoEntry(id: string) {
  await db.delete(cryptoInventory).where(eq(cryptoInventory.id, id));
}

// ---------------------------------------------------------------------------
// Posture dashboard
// ---------------------------------------------------------------------------

export async function getCryptoPosture(organizationId: string) {
  const orgFilter = eq(cryptoInventory.organizationId, organizationId);

  const rows = await db
    .select()
    .from(cryptoInventory)
    .where(orgFilter);

  const total = rows.length;
  const active = rows.filter((r) => r.status === "ACTIVE");
  const pqcVulnerable = active.filter((r) => r.pqcVulnerable);
  const deprecated = rows.filter((r) => r.status === "DEPRECATED");

  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 86400000);

  const keyRotationOverdue = active.filter((r) => {
    if (!r.keyNextRotation) return false;
    return new Date(r.keyNextRotation) < now;
  });

  const certsExpiringSoon = active.filter((r) => {
    if (!r.certificateExpiry) return false;
    const exp = new Date(r.certificateExpiry);
    return exp <= in90Days && exp > now;
  });

  const certsExpired = active.filter((r) => {
    if (!r.certificateExpiry) return false;
    return new Date(r.certificateExpiry) <= now;
  });

  // PQC migration breakdown
  const pqcByStatus: Record<string, number> = {};
  for (const r of pqcVulnerable) {
    pqcByStatus[r.pqcMigrationStatus] = (pqcByStatus[r.pqcMigrationStatus] ?? 0) + 1;
  }

  // Posture score (0-100)
  let score = 100;
  if (total === 0) score = 0;
  else {
    // Deduct for PQC vulnerable without migration plan
    const pqcNotStarted = pqcVulnerable.filter((r) => r.pqcMigrationStatus === "NOT_STARTED").length;
    score -= Math.min(30, pqcNotStarted * 10);
    // Deduct for overdue key rotations
    score -= Math.min(20, keyRotationOverdue.length * 5);
    // Deduct for expired certs
    score -= Math.min(20, certsExpired.length * 10);
    // Deduct for deprecated algorithms
    score -= Math.min(15, deprecated.length * 5);
    // Deduct for certs expiring soon
    score -= Math.min(10, certsExpiringSoon.length * 3);
    score = Math.max(0, score);
  }

  return {
    total,
    activeCount: active.length,
    pqcVulnerableCount: pqcVulnerable.length,
    pqcVulnerablePercent: total > 0 ? Math.round((pqcVulnerable.length / active.length) * 100) : 0,
    pqcByStatus,
    keyRotationOverdue: keyRotationOverdue.length,
    certsExpiringSoon: certsExpiringSoon.length,
    certsExpired: certsExpired.length,
    deprecatedCount: deprecated.length,
    postureScore: score,
  };
}

export async function getPqcReadinessReport(organizationId: string) {
  const rows = await db
    .select()
    .from(cryptoInventory)
    .where(
      and(
        eq(cryptoInventory.organizationId, organizationId),
        eq(cryptoInventory.pqcVulnerable, true),
      )
    )
    .orderBy(cryptoInventory.name);

  return {
    totalVulnerable: rows.length,
    mechanisms: rows.map(toResponse),
    byStatus: {
      NOT_STARTED: rows.filter((r) => r.pqcMigrationStatus === "NOT_STARTED").length,
      EVALUATING: rows.filter((r) => r.pqcMigrationStatus === "EVALUATING").length,
      MIGRATION_PLANNED: rows.filter((r) => r.pqcMigrationStatus === "MIGRATION_PLANNED").length,
      IN_PROGRESS: rows.filter((r) => r.pqcMigrationStatus === "IN_PROGRESS").length,
      COMPLETED: rows.filter((r) => r.pqcMigrationStatus === "COMPLETED").length,
    },
  };
}
