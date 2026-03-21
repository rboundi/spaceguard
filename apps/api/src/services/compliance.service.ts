import { eq, and } from "drizzle-orm";
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

  // Validate asset exists (if provided)
  if (data.assetId) {
    const [asset] = await db
      .select({ id: spaceAssets.id })
      .from(spaceAssets)
      .where(eq(spaceAssets.id, data.assetId))
      .limit(1);

    if (!asset) {
      throw new HTTPException(404, {
        message: `Asset ${data.assetId} not found`,
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

export async function deleteMapping(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: complianceMappings.id })
    .from(complianceMappings)
    .where(eq(complianceMappings.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: `Mapping ${id} not found` });
  }

  await db.delete(complianceMappings).where(eq(complianceMappings.id, id));
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
