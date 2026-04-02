import { eq, and, count, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { spaceAssets, organizations } from "../db/schema/index";
import type {
  CreateAsset,
  UpdateAsset,
  AssetQuery,
  AssetResponse,
  AssetTreeNode,
} from "@spaceguard/shared";
import {
  AssetStatus,
  AssetSegment,
  Criticality,
  AssetType,
  assetTypeSegment,
} from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Valid parent-child type relationships per segment
// ---------------------------------------------------------------------------

const SPACE_PARENT_TYPES = new Set([
  AssetType.LEO_SATELLITE,
  AssetType.MEO_SATELLITE,
  AssetType.GEO_SATELLITE,
]);

const SPACE_CHILD_TYPES = new Set([
  AssetType.CDHS,
  AssetType.COM_SUBSYSTEM,
  AssetType.ADCS,
  AssetType.EPS,
  AssetType.PAYLOAD,
  AssetType.PROPULSION,
  AssetType.THERMAL,
]);

const GROUND_PARENT_TYPES = new Set([
  AssetType.GROUND_STATION,
  AssetType.CONTROL_CENTER,
  AssetType.DATA_CENTER,
]);

const GROUND_CHILD_TYPES = new Set([
  AssetType.TTC_ANTENNA,
  AssetType.SLE_INTERFACE,
  AssetType.CRYPTO_UNIT_GROUND,
  AssetType.MISSION_PLANNING,
  AssetType.FLIGHT_DYNAMICS,
  AssetType.GROUND_NETWORK,
  AssetType.UPLINK,
  AssetType.DOWNLINK,
  AssetType.NETWORK_SEGMENT,
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toResponse(row: typeof spaceAssets.$inferSelect): AssetResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    parentAssetId: row.parentAssetId ?? null,
    name: row.name,
    assetType: row.assetType as AssetResponse["assetType"],
    segment: (row.segment as AssetResponse["segment"]) ?? null,
    description: row.description ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    status: row.status as AssetResponse["status"],
    criticality: row.criticality as AssetResponse["criticality"],
    lifecyclePhase: (row.lifecyclePhase as AssetResponse["lifecyclePhase"]) ?? null,
    lifecyclePhaseEnteredAt: row.lifecyclePhaseEnteredAt?.toISOString() ?? null,
    endOfLifeDate: row.endOfLifeDate ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Validate that a child asset type can attach to a given parent asset type.
 */
function validateParentChild(parentType: AssetType, childType: AssetType): void {
  // Space subsystems can only attach to satellites
  if (SPACE_CHILD_TYPES.has(childType)) {
    if (!SPACE_PARENT_TYPES.has(parentType)) {
      throw new HTTPException(400, {
        message: `Asset type ${childType} can only be a subsystem of a satellite (LEO/MEO/GEO), not ${parentType}`,
      });
    }
    return;
  }

  // Ground subsystems can only attach to ground segment parents
  if (GROUND_CHILD_TYPES.has(childType)) {
    if (!GROUND_PARENT_TYPES.has(parentType)) {
      throw new HTTPException(400, {
        message: `Asset type ${childType} can only be a subsystem of a ground segment asset, not ${parentType}`,
      });
    }
    return;
  }

  // Generic children: no specific constraint, but warn if cross-segment
  const parentSeg = assetTypeSegment[parentType];
  const childSeg = assetTypeSegment[childType];
  if (parentSeg !== childSeg) {
    throw new HTTPException(400, {
      message: `Cannot attach ${childType} (${childSeg}) as child of ${parentType} (${parentSeg}): segment mismatch`,
    });
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

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

  // Auto-derive segment from asset type if not provided
  const segment = data.segment ?? assetTypeSegment[data.assetType] ?? null;

  // Validate parent-child relationship if attaching to a parent
  if (data.parentAssetId) {
    const [parent] = await db
      .select()
      .from(spaceAssets)
      .where(
        and(
          eq(spaceAssets.id, data.parentAssetId),
          eq(spaceAssets.organizationId, data.organizationId),
        )
      )
      .limit(1);

    if (!parent) {
      throw new HTTPException(404, {
        message: `Parent asset ${data.parentAssetId} not found in this organization`,
      });
    }

    validateParentChild(parent.assetType as AssetType, data.assetType);
  }

  const [row] = await db
    .insert(spaceAssets)
    .values({
      organizationId: data.organizationId,
      parentAssetId: data.parentAssetId ?? null,
      name: data.name,
      assetType: data.assetType,
      segment,
      description: data.description,
      metadata: data.metadata,
      status: data.status ?? AssetStatus.OPERATIONAL,
      criticality: data.criticality ?? Criticality.MEDIUM,
      lifecyclePhase: data.lifecyclePhase ?? "PHASE_E_OPERATIONS",
      lifecyclePhaseEnteredAt: data.lifecyclePhase ? new Date() : null,
      endOfLifeDate: data.endOfLifeDate ?? null,
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
  const { page, perPage, organizationId, type, status, segment, parentAssetId, topLevelOnly } = query;
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
  if (segment) {
    conditions.push(eq(spaceAssets.segment, segment));
  }
  if (parentAssetId) {
    conditions.push(eq(spaceAssets.parentAssetId, parentAssetId));
  }
  if (topLevelOnly) {
    conditions.push(isNull(spaceAssets.parentAssetId));
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
  const existing = await getAsset(id);

  // If changing lifecycle phase, record the timestamp
  const updates: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.lifecyclePhase && data.lifecyclePhase !== existing.lifecyclePhase) {
    updates.lifecyclePhaseEnteredAt = new Date();
  }

  // If segment is being set, auto-derive from type if not explicit
  if (data.assetType && !data.segment) {
    updates.segment = assetTypeSegment[data.assetType] ?? existing.segment;
  }

  // If changing parent, validate the new relationship
  if (data.parentAssetId) {
    const assetType = (data.assetType ?? existing.assetType) as AssetType;
    const [parent] = await db
      .select()
      .from(spaceAssets)
      .where(
        and(
          eq(spaceAssets.id, data.parentAssetId),
          eq(spaceAssets.organizationId, existing.organizationId),
        )
      )
      .limit(1);

    if (!parent) {
      throw new HTTPException(404, {
        message: `Parent asset ${data.parentAssetId} not found in this organization`,
      });
    }

    validateParentChild(parent.assetType as AssetType, assetType);
  }

  const [row] = await db
    .update(spaceAssets)
    .set(updates)
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

// ---------------------------------------------------------------------------
// Tree / Hierarchy queries
// ---------------------------------------------------------------------------

/**
 * Get all assets for an organization as a tree (parents with nested children).
 * Loads all assets in a single query, then builds the tree in memory.
 */
export async function getAssetTree(organizationId: string): Promise<AssetTreeNode[]> {
  const rows = await db
    .select()
    .from(spaceAssets)
    .where(eq(spaceAssets.organizationId, organizationId))
    .orderBy(spaceAssets.createdAt);

  const nodeMap = new Map<string, AssetTreeNode>();
  const roots: AssetTreeNode[] = [];

  // First pass: create all nodes
  for (const row of rows) {
    nodeMap.set(row.id, { ...toResponse(row), children: [] });
  }

  // Second pass: build tree
  for (const node of nodeMap.values()) {
    if (node.parentAssetId && nodeMap.has(node.parentAssetId)) {
      nodeMap.get(node.parentAssetId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Get a single asset with its direct children (subsystems).
 */
export async function getAssetWithChildren(
  id: string,
): Promise<AssetTreeNode> {
  const asset = await getAsset(id);

  const children = await db
    .select()
    .from(spaceAssets)
    .where(eq(spaceAssets.parentAssetId, id))
    .orderBy(spaceAssets.createdAt);

  return {
    ...asset,
    children: children.map((c) => ({ ...toResponse(c), children: [] })),
  };
}
