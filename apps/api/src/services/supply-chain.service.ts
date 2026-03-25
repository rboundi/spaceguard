import { eq, and, count } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { suppliers, organizations } from "../db/schema/index";
import type {
  CreateSupplier,
  UpdateSupplier,
  SupplierQuery,
  SupplierResponse,
} from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toResponse(row: typeof suppliers.$inferSelect): SupplierResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    type: row.type as SupplierResponse["type"],
    country: row.country,
    criticality: row.criticality as SupplierResponse["criticality"],
    description: row.description ?? undefined,
    contactInfo: (row.contactInfo as Record<string, unknown>) ?? undefined,
    assetsSupplied: (row.assetsSupplied as string[]) ?? undefined,
    securityAssessment: row.securityAssessment
      ? (row.securityAssessment as SupplierResponse["securityAssessment"])
      : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createSupplier(
  data: CreateSupplier
): Promise<SupplierResponse> {
  // Verify the organization exists
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, data.organizationId))
    .limit(1);

  if (!org) {
    throw new HTTPException(404, {
      message: `Organization ${data.organizationId} not found`,
    });
  }

  const [row] = await db
    .insert(suppliers)
    .values({
      organizationId: data.organizationId,
      name: data.name,
      type: data.type,
      country: data.country,
      criticality: data.criticality ?? "MEDIUM",
      description: data.description,
      contactInfo: data.contactInfo,
      assetsSupplied: data.assetsSupplied,
      securityAssessment: data.securityAssessment,
    })
    .returning();

  return toResponse(row);
}

export async function getSupplier(id: string): Promise<SupplierResponse> {
  const [row] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: `Supplier ${id} not found` });
  }

  return toResponse(row);
}

export async function listSuppliers(query: SupplierQuery): Promise<{
  data: SupplierResponse[];
  total: number;
  page: number;
  perPage: number;
}> {
  const { page, perPage, organizationId, type, criticality } = query;
  const offset = (page - 1) * perPage;

  const conditions = [];
  if (organizationId) {
    conditions.push(eq(suppliers.organizationId, organizationId));
  }
  if (type) {
    conditions.push(eq(suppliers.type, type));
  }
  if (criticality) {
    conditions.push(eq(suppliers.criticality, criticality));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(suppliers)
      .where(where)
      .orderBy(suppliers.createdAt)
      .limit(perPage)
      .offset(offset),
    db.select({ total: count() }).from(suppliers).where(where),
  ]);

  return {
    data: rows.map(toResponse),
    total: Number(total),
    page,
    perPage,
  };
}

export async function updateSupplier(
  id: string,
  data: UpdateSupplier
): Promise<SupplierResponse> {
  await getSupplier(id);

  const [row] = await db
    .update(suppliers)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, id))
    .returning();

  return toResponse(row);
}

export async function deleteSupplier(id: string): Promise<SupplierResponse> {
  const existing = await getSupplier(id);

  await db.delete(suppliers).where(eq(suppliers.id, id));

  return existing;
}

// ---------------------------------------------------------------------------
// Risk summary
// ---------------------------------------------------------------------------

export interface SupplierRiskSummary {
  totalSuppliers: number;
  highRiskCount: number;
  overdueAssessments: number;
  countryDistribution: Record<string, number>;
  byType: Record<string, number>;
  byCriticality: Record<string, number>;
  certificationGaps: {
    noIso27001: number;
    noSoc2: number;
    noNis2: number;
  };
  averageRiskScore: number;
}

export async function getSupplierRiskSummary(
  organizationId: string
): Promise<SupplierRiskSummary> {
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.organizationId, organizationId));

  const now = new Date();
  let totalRiskScore = 0;
  let riskScoreCount = 0;
  let highRiskCount = 0;
  let overdueAssessments = 0;
  let noIso27001 = 0;
  let noSoc2 = 0;
  let noNis2 = 0;
  const countryDist: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byCriticality: Record<string, number> = {};

  for (const row of rows) {
    // Country
    countryDist[row.country] = (countryDist[row.country] ?? 0) + 1;

    // Type
    byType[row.type] = (byType[row.type] ?? 0) + 1;

    // Criticality
    byCriticality[row.criticality] = (byCriticality[row.criticality] ?? 0) + 1;

    // High risk = CRITICAL or HIGH criticality, or riskScore >= 7
    const sa = row.securityAssessment as {
      lastAssessed?: string | null;
      nextReview?: string | null;
      iso27001Certified?: boolean;
      soc2Certified?: boolean;
      nis2Compliant?: boolean;
      riskScore?: number;
      notes?: string | null;
    } | null;

    if (row.criticality === "CRITICAL" || row.criticality === "HIGH") {
      highRiskCount++;
    } else if (sa?.riskScore && sa.riskScore >= 7) {
      highRiskCount++;
    }

    // Overdue assessments
    if (sa?.nextReview) {
      const reviewDate = new Date(sa.nextReview);
      if (reviewDate < now) {
        overdueAssessments++;
      }
    }

    // Certification gaps
    if (!sa?.iso27001Certified) noIso27001++;
    if (!sa?.soc2Certified) noSoc2++;
    if (!sa?.nis2Compliant) noNis2++;

    // Risk score
    if (sa?.riskScore) {
      totalRiskScore += sa.riskScore;
      riskScoreCount++;
    }
  }

  return {
    totalSuppliers: rows.length,
    highRiskCount,
    overdueAssessments,
    countryDistribution: countryDist,
    byType,
    byCriticality,
    certificationGaps: {
      noIso27001,
      noSoc2,
      noNis2,
    },
    averageRiskScore:
      riskScoreCount > 0
        ? Math.round((totalRiskScore / riskScoreCount) * 10) / 10
        : 0,
  };
}
