import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createAssetSchema,
  updateAssetSchema,
  assetQuerySchema,
} from "@spaceguard/shared";
import {
  createAsset,
  getAsset,
  listAssets,
  updateAsset,
  deleteAsset,
  getAssetTree,
  getAssetWithChildren,
} from "../services/asset.service";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const assetRoutes = new Hono();

import { assertUUID, assertTenant } from "../middleware/validate";

// POST /api/v1/assets
assetRoutes.post(
  "/assets",
  zValidator("json", createAssetSchema),
  async (c) => {
    const data = c.req.valid("json");
    assertTenant(c, data.organizationId);
    const asset = await createAsset(data);
    logAudit({
      organizationId: asset.organizationId,
      actor: extractActor(c),
      action: "CREATE",
      resourceType: "asset",
      resourceId: asset.id,
      details: {
        name: asset.name,
        assetType: asset.assetType,
        criticality: asset.criticality,
        segment: asset.segment,
        parentAssetId: asset.parentAssetId,
      },
      ipAddress: extractIp(c),
    });
    return c.json(asset, 201);
  }
);

// GET /api/v1/assets?organizationId=&type=&status=&segment=&parentAssetId=&topLevelOnly=&page=&perPage=
assetRoutes.get(
  "/assets",
  zValidator("query", assetQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    if (query.organizationId) assertTenant(c, query.organizationId);
    const result = await listAssets(query);
    return c.json(result);
  }
);

// GET /api/v1/assets/tree?organizationId=
// Returns the full asset hierarchy as a nested tree
assetRoutes.get("/assets/tree", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);

  const tree = await getAssetTree(organizationId);
  return c.json({ data: tree, total: tree.length });
});

// GET /api/v1/assets/:id
assetRoutes.get("/assets/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const asset = await getAsset(id);
  assertTenant(c, asset.organizationId);
  return c.json(asset);
});

// GET /api/v1/assets/:id/children
// Returns the asset with its direct subsystems
assetRoutes.get("/assets/:id/children", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const tree = await getAssetWithChildren(id);
  assertTenant(c, tree.organizationId);
  return c.json(tree);
});

// PUT /api/v1/assets/:id
assetRoutes.put(
  "/assets/:id",
  zValidator("json", updateAssetSchema),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");
    const existing = await getAsset(id);
    assertTenant(c, existing.organizationId);
    const data = c.req.valid("json");
    const asset = await updateAsset(id, data);
    logAudit({
      organizationId: asset.organizationId,
      actor: extractActor(c),
      action: "UPDATE",
      resourceType: "asset",
      resourceId: id,
      details: { changes: data },
      ipAddress: extractIp(c),
    });
    return c.json(asset);
  }
);

// DELETE /api/v1/assets/:id  (soft delete - sets status to DECOMMISSIONED)
assetRoutes.delete("/assets/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const existing = await getAsset(id);
  assertTenant(c, existing.organizationId);
  const asset = await deleteAsset(id);
  logAudit({
    organizationId: asset.organizationId,
    actor: extractActor(c),
    action: "DELETE",
    resourceType: "asset",
    resourceId: id,
    details: { name: asset.name },
    ipAddress: extractIp(c),
  });
  return c.json(asset);
});
