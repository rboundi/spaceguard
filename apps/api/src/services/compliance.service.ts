import { eq, and, count, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import {
  complianceRequirements,
  complianceMappings,
  organizations,
  spaceAssets,
} from "../db/schema/index";
import type {
  CreateMapping,
  UpdateMapping,
  MappingResponse,
  ComplianceRequirement,
  DashboardResponse,
} from "@spaceguard/shared";
import { ComplianceStatus } from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requirementToResponse(
  row: typeof complianceRequirements.$inferSelect
): ComplianceRequirement {
  return {
    id: row.id,
    regulation: row.regulation as ComplianceRequirement["regulation"],
    articleReference: row.articleReference,
    title: row.title,
    description: row.description,
    evidenceGuidance: row.evidenceGuidance,
    category: row.category,
    applicabilityNotes: row.applicabilityNotes ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mappingToResponse(
  row: typeof complianceMappings.$inferSelect
): MappingResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assetId: row.assetId ?? null,
    requirementId: row.requirementId,
    status: row.status as MappingResponse["status"],
    evidenceDescription: row.evidenceDescription ?? undefined,
    responsiblePerson: row.responsiblePerson ?? undefined,
    nextReviewDate: row.nextReviewDate ?? undefined,
    notes: row.notes ?? undefined,
    lastAssessed: row.lastAssessed ? row.lastAssessed.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Requirements (read-only, populated by seed)
// ---------------------------------------------------------------------------

export async function listRequirements(filters: {
  regulation?: string;
  category?: string;
}): Promise<ComplianceRequirement[]> {
  const conditions = [];

  if (filters.regulation) {
    conditions.push(
      eq(
        complianceRequirements.regulation,
        filters.regulation as typeof complianceRequirements.$inferSelect["regulation"]
      )
    );
  }
  if (filters.category) {
    conditions.push(eq(complianceRequirements.category, filters.category));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(complianceRequirements)
    .where(where)
    .orderBy(complianceRequirements.regulation, complianceRequirements.category);

  return rows.map(requirementToResponse);
}

export async function getRequirement(id: string): Promise<ComplianceRequirement> {
  const [row] = await db
    .select()
    .from(complianceRequirements)
    .where(eq(complianceRequirements.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, {
      message: `Compliance requirement ${id} not found`,
    });
  }

  return requirementToResponse(row);
}

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

export async function createMapping(data: CreateMapping): Promise<MappingResponse> {
  // Validate organization exists
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

  // Validate requirement exists
  const [req] = await db
    .select({ id: complianceRequirements.id })
    .from(complianceRequirements)
    .where(eq(complianceRequirements.id, data.requirementId))
    .limit(1);

  if (!req) {
    throw new HTTPException(404, {
      message: `Compliance requirement ${data.requirementId} not found`,
    });
  }

  // Validate asset exists and belongs to the same organization (if provided)
  if (data.assetId) {
    const [asset] = await db
      .select({ id: spaceAssets.id })
      .from(spaceAssets)
      .where(
        and(
          eq(spaceAssets.id, data.assetId),
          eq(spaceAssets.organizationId, data.organizationId)
        )
      )
      .limit(1);

    if (!asset) {
      throw new HTTPException(404, {
        message: `Asset ${data.assetId} not found in this organization`,
      });
    }
  }

  // Prevent duplicate org-level mappings (assetId = null, same org + requirement)
  if (!data.assetId) {
    const [duplicate] = await db
      .select({ id: complianceMappings.id })
      .from(complianceMappings)
      .where(
        and(
          eq(complianceMappings.organizationId, data.organizationId),
          eq(complianceMappings.requirementId, data.requirementId),
          isNull(complianceMappings.assetId)
        )
      )
      .limit(1);

    if (duplicate) {
      throw new HTTPException(409, {
        message: `An organization-level mapping already exists for this requirement`,
      });
    }
  }

  const [row] = await db
    .insert(complianceMappings)
    .values({
      organizationId: data.organizationId,
      assetId: data.assetId ?? null,
      requirementId: data.requirementId,
      status: data.status ?? ComplianceStatus.NOT_ASSESSED,
      evidenceDescription: data.evidenceDescription,
      responsiblePerson: data.responsiblePerson,
      nextReviewDate: data.nextReviewDate,
      notes: data.notes,
    })
    .returning();

  return mappingToResponse(row);
}

export async function getMappingOrgId(id: string): Promise<string> {
  const [existing] = await db
    .select({ organizationId: complianceMappings.organizationId })
    .from(complianceMappings)
    .where(eq(complianceMappings.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: `Mapping ${id} not found` });
  }
  return existing.organizationId;
}

export async function updateMapping(
  id: string,
  data: UpdateMapping
): Promise<MappingResponse> {
  const [existing] = await db
    .select()
    .from(complianceMappings)
    .where(eq(complianceMappings.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: `Mapping ${id} not found` });
  }

  // Set lastAssessed whenever the status changes to something meaningful
  const statusChanged =
    data.status !== undefined && data.status !== existing.status;
  const isAssessedStatus =
    data.status === ComplianceStatus.COMPLIANT ||
    data.status === ComplianceStatus.PARTIALLY_COMPLIANT ||
    data.status === ComplianceStatus.NON_COMPLIANT;

  const [row] = await db
    .update(complianceMappings)
    .set({
      ...data,
      assetId: data.assetId === undefined ? existing.assetId : data.assetId,
      lastAssessed:
        statusChanged && isAssessedStatus ? new Date() : existing.lastAssessed,
      updatedAt: new Date(),
    })
    .where(eq(complianceMappings.id, id))
    .returning();

  return mappingToResponse(row);
}

export async function deleteMapping(id: string): Promise<{ organizationId: string }> {
  const [existing] = await db
    .select({
      id: complianceMappings.id,
      organizationId: complianceMappings.organizationId,
    })
    .from(complianceMappings)
    .where(eq(complianceMappings.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: `Mapping ${id} not found` });
  }

  await db.delete(complianceMappings).where(eq(complianceMappings.id, id));
  return { organizationId: existing.organizationId };
}

export async function listMappings(filters: {
  organizationId?: string;
  assetId?: string;
  requirementId?: string;
  status?: string;
}): Promise<MappingResponse[]> {
  const conditions = [];

  if (filters.organizationId) {
    conditions.push(
      eq(complianceMappings.organizationId, filters.organizationId)
    );
  }
  if (filters.assetId) {
    conditions.push(eq(complianceMappings.assetId, filters.assetId));
  }
  if (filters.requirementId) {
    conditions.push(
      eq(complianceMappings.requirementId, filters.requirementId)
    );
  }
  if (filters.status) {
    conditions.push(
      eq(
        complianceMappings.status,
        filters.status as typeof complianceMappings.$inferSelect["status"]
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(complianceMappings)
    .where(where)
    .orderBy(complianceMappings.createdAt);

  return rows.map(mappingToResponse);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

// Status priority used to determine "effective" status for a requirement
// when it has multiple mappings. Lower number = worse status.
const STATUS_PRIORITY: Record<string, number> = {
  NOT_ASSESSED: 1,
  NON_COMPLIANT: 2,
  PARTIALLY_COMPLIANT: 3,
  COMPLIANT: 4,
};

export async function getDashboard(
  organizationId: string
): Promise<DashboardResponse> {
  // 1. Verify org exists
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    throw new HTTPException(404, {
      message: `Organization ${organizationId} not found`,
    });
  }

  // 2. Fetch all requirements and current org mappings in parallel
  const [allRequirements, existingMappings, orgAssets] = await Promise.all([
    db
      .select()
      .from(complianceRequirements)
      .orderBy(complianceRequirements.category),

    // Left join with space_assets so we get asset names in one query
    db
      .select({
        id: complianceMappings.id,
        requirementId: complianceMappings.requirementId,
        status: complianceMappings.status,
        assetId: complianceMappings.assetId,
        assetName: spaceAssets.name,
      })
      .from(complianceMappings)
      .leftJoin(spaceAssets, eq(complianceMappings.assetId, spaceAssets.id))
      .where(eq(complianceMappings.organizationId, organizationId)),

    db
      .select({
        assetType: spaceAssets.assetType,
        criticality: spaceAssets.criticality,
      })
      .from(spaceAssets)
      .where(eq(spaceAssets.organizationId, organizationId)),
  ]);

  // 3. Auto-seed NOT_ASSESSED mappings for any requirements that have no mapping yet.
  // Using a Set of already-mapped requirementIds makes this idempotent: new requirements
  // added after the initial seed are picked up on the next dashboard load, and concurrent
  // requests inserting the same row are harmless because each org-level mapping is
  // uniquely identified by (organizationId, requirementId, assetId=null).
  let mappings = existingMappings;
  const mappedReqIds = new Set(existingMappings.map((m) => m.requirementId));
  const unseededRequirements = allRequirements.filter(
    (r) => !mappedReqIds.has(r.id)
  );
  if (unseededRequirements.length > 0) {
    // onConflictDoNothing relies on the partial unique index
    // compliance_mappings_org_req_org_level_uniq (org + req WHERE asset_id IS NULL).
    // This makes concurrent dashboard requests safe: whichever request wins the
    // insert, the others silently skip rather than returning 500 or creating duplicates.
    await db
      .insert(complianceMappings)
      .values(
        unseededRequirements.map((req) => ({
          organizationId,
          requirementId: req.id,
          status: ComplianceStatus.NOT_ASSESSED,
        }))
      )
      .onConflictDoNothing();

    // Re-fetch after seeding
    mappings = await db
      .select({
        id: complianceMappings.id,
        requirementId: complianceMappings.requirementId,
        status: complianceMappings.status,
        assetId: complianceMappings.assetId,
        assetName: spaceAssets.name,
      })
      .from(complianceMappings)
      .leftJoin(spaceAssets, eq(complianceMappings.assetId, spaceAssets.id))
      .where(eq(complianceMappings.organizationId, organizationId));
  }

  // 4. Group mappings by requirementId
  const mappingsByReq = new Map<
    string,
    Array<{ status: string; assetName: string | null }>
  >();
  for (const m of mappings) {
    if (!mappingsByReq.has(m.requirementId)) {
      mappingsByReq.set(m.requirementId, []);
    }
    mappingsByReq.get(m.requirementId)!.push({
      status: m.status,
      assetName: m.assetName ?? null,
    });
  }

  // 5. Compute effective status per requirement (worst across all its mappings)
  type ReqSummary = {
    effectiveStatus: string;
    requirement: (typeof allRequirements)[0];
    assetNames: string[];
  };

  const reqSummaries: ReqSummary[] = allRequirements.map((req) => {
    const reqMappings = mappingsByReq.get(req.id) ?? [];

    if (reqMappings.length === 0) {
      return { effectiveStatus: ComplianceStatus.NOT_ASSESSED, requirement: req, assetNames: [] };
    }

    let worstStatus = ComplianceStatus.COMPLIANT as string;
    const assetNames: string[] = [];

    for (const m of reqMappings) {
      if (STATUS_PRIORITY[m.status] < STATUS_PRIORITY[worstStatus]) {
        worstStatus = m.status;
      }
      if (m.assetName) assetNames.push(m.assetName);
    }

    return { effectiveStatus: worstStatus, requirement: req, assetNames };
  });

  // 6. Overall score: % of requirements that are COMPLIANT
  const totalRequirements = allRequirements.length;
  const compliantCount = reqSummaries.filter(
    (r) => r.effectiveStatus === ComplianceStatus.COMPLIANT
  ).length;
  const overallScore =
    totalRequirements > 0
      ? Math.round((compliantCount / totalRequirements) * 100)
      : 0;

  // 7. Count by status
  const byStatus: Record<string, number> = {
    [ComplianceStatus.NOT_ASSESSED]: 0,
    [ComplianceStatus.NON_COMPLIANT]: 0,
    [ComplianceStatus.PARTIALLY_COMPLIANT]: 0,
    [ComplianceStatus.COMPLIANT]: 0,
  };
  for (const { effectiveStatus } of reqSummaries) {
    byStatus[effectiveStatus] = (byStatus[effectiveStatus] ?? 0) + 1;
  }

  // 8. Score by category
  const categoryMap = new Map<string, { total: number; compliant: number }>();
  for (const { effectiveStatus, requirement } of reqSummaries) {
    const cat = requirement.category;
    if (!categoryMap.has(cat)) categoryMap.set(cat, { total: 0, compliant: 0 });
    const entry = categoryMap.get(cat)!;
    entry.total++;
    if (effectiveStatus === ComplianceStatus.COMPLIANT) entry.compliant++;
  }
  const byCategory = Array.from(categoryMap.entries())
    .map(([category, { total, compliant }]) => ({
      category,
      total,
      compliant,
      score: total > 0 ? Math.round((compliant / total) * 100) : 0,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  // 9. Score by regulation
  const regulationMap = new Map<string, { total: number; compliant: number }>();
  for (const { effectiveStatus, requirement } of reqSummaries) {
    const reg = requirement.regulation;
    if (!regulationMap.has(reg)) regulationMap.set(reg, { total: 0, compliant: 0 });
    const entry = regulationMap.get(reg)!;
    entry.total++;
    if (effectiveStatus === ComplianceStatus.COMPLIANT) entry.compliant++;
  }
  const byRegulation = Array.from(regulationMap.entries())
    .map(([regulation, { total, compliant }]) => ({
      regulation,
      total,
      compliant,
      score: total > 0 ? Math.round((compliant / total) * 100) : 0,
    }))
    .sort((a, b) => a.regulation.localeCompare(b.regulation));

  // 10. Gaps: NOT_ASSESSED or NON_COMPLIANT requirements
  const gaps = reqSummaries
    .filter(
      ({ effectiveStatus }) =>
        effectiveStatus === ComplianceStatus.NOT_ASSESSED ||
        effectiveStatus === ComplianceStatus.NON_COMPLIANT
    )
    .map(({ effectiveStatus, requirement, assetNames }) => ({
      requirementId: requirement.id,
      title: requirement.title,
      category: requirement.category,
      status: effectiveStatus as
        | typeof ComplianceStatus.NOT_ASSESSED
        | typeof ComplianceStatus.NON_COMPLIANT,
      affectedAssets: assetNames,
    }));

  // 11. Asset summary
  const byType: Record<string, number> = {};
  const byCriticality: Record<string, number> = {};
  for (const asset of orgAssets) {
    byType[asset.assetType] = (byType[asset.assetType] ?? 0) + 1;
    byCriticality[asset.criticality] = (byCriticality[asset.criticality] ?? 0) + 1;
  }

  return {
    organization: { id: org.id, name: org.name },
    overallScore,
    totalRequirements,
    byStatus: byStatus as DashboardResponse["byStatus"],
    byCategory,
    byRegulation,
    gaps,
    assetsSummary: {
      total: orgAssets.length,
      byType,
      byCriticality,
    },
  };
}

// ---------------------------------------------------------------------------
// Initialize compliance mappings (used by onboarding wizard)
// ---------------------------------------------------------------------------

/**
 * Creates NOT_ASSESSED org-level mappings for all requirements that do not
 * already have one. Returns the count of newly created mappings.
 */
export async function initializeComplianceMappings(
  organizationId: string
): Promise<{ created: number; total: number }> {
  // Verify org exists
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    throw new HTTPException(404, {
      message: `Organization ${organizationId} not found`,
    });
  }

  // Fetch all requirements
  const allRequirements = await db
    .select({ id: complianceRequirements.id })
    .from(complianceRequirements);

  // Fetch existing org-level mappings
  const existingMappings = await db
    .select({ requirementId: complianceMappings.requirementId })
    .from(complianceMappings)
    .where(
      and(
        eq(complianceMappings.organizationId, organizationId),
        isNull(complianceMappings.assetId)
      )
    );

  const mappedReqIds = new Set(existingMappings.map((m) => m.requirementId));
  const unseeded = allRequirements.filter((r) => !mappedReqIds.has(r.id));

  if (unseeded.length > 0) {
    await db
      .insert(complianceMappings)
      .values(
        unseeded.map((req) => ({
          organizationId,
          requirementId: req.id,
          status: ComplianceStatus.NOT_ASSESSED,
        }))
      )
      .onConflictDoNothing();
  }

  // Count total mappings after initialization
  const [{ mappingCount }] = await db
    .select({ mappingCount: count() })
    .from(complianceMappings)
    .where(
      and(
        eq(complianceMappings.organizationId, organizationId),
        isNull(complianceMappings.assetId)
      )
    );

  return { created: unseeded.length, total: Number(mappingCount) };
}
