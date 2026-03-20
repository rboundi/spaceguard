import { eq, and, count } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { spaceAssets, organizations } from "../db/schema/index";
import type {
  CreateAsset,
  UpdateAsset,
  AssetQuery,
  AssetResponse,
} from "@spaceguard/shared";
import { AssetStatus } from "@spaceguard/shared";

function toResponse(row: typeof spaceAssets.$inferSelect): AssetResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    assetType: row.assetType as AssetResponse["assetType"],
    description: row.description ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    status: row.status as AssetResponse["status"],
    criticality: row.criticality as AssetResponse["criticality"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createAsset(data: CreateAsset): Promise<AssetResponse> {
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
    .insert(spaceAssets)
    .values({
      organizationId: data.organizationId,
      name: data.name,
      assetType: data.assetType,
      description: data.description,
      metadata: data.metadata,
      status: data.status ?? AssetStatus.OPERATIONAL,
      criticality: data.criticality ?? "MEDIUM",
    })
    .returning();

  return toResponse(row);
}

export async function getAsset(id: string): Promise<AssetResponse> {
  const [row] = await db
    .select()
    .from(spaceAssets)
    .where(eq(spaceAssets.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: `Asset ${id} not found` });
  }

  return toResponse(row);
}

export async function listAssets(query: AssetQuery): Promise<{
  data: AssetResponse[];
  total: number;
  page: number;
  perPage: number;
}> {
  const { page, perPage, organizationId, type, status } = query;
  const offset = (page - 1) * perPage;

  // Build conditions array
  const conditions = [];
  if (organizationId) {
    conditions.push(eq(spaceAssets.organizationId, organizationId));
  }
  if (type) {
    conditions.push(eq(spaceAssets.assetType, type));
  }
  if (status) {
    conditions.push(eq(spaceAssets.status, status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(spaceAssets)
      .where(where)
      .orderBy(spaceAssets.createdAt)
      .limit(perPage)
      .offset(offset),
    db
      .select({ total: count() })
      .from(spaceAssets)
      .where(where),
  ]);

  return {
    data: rows.map(toResponse),
    total: Number(total),
    page,
    perPage,
  };
}

export async function updateAsset(
  id: string,
  data: UpdateAsset
): Promise<AssetResponse> {
  // Confirm asset exists first
  await getAsset(id);

  const [row] = await db
    .update(spaceAssets)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(spaceAssets.id, id))
    .returning();

  return toResponse(row);
}

export async function deleteAsset(id: string): Promise<AssetResponse> {
  // Soft delete: mark as DECOMMISSIONED rather than removing the row
  await getAsset(id);

  const [row] = await db
    .update(spaceAssets)
    .set({
      status: AssetStatus.DECOMMISSIONED,
      updatedAt: new Date(),
    })
    .where(eq(spaceAssets.id, id))
    .returning();

  return toResponse(row);
}
