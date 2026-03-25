import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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
} from "../services/asset.service";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const assetRoutes = new Hono();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUUID(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new HTTPException(400, { message: `${label} must be a valid UUID` });
  }
}

// POST /api/v1/assets
assetRoutes.post(
  "/assets",
  zValidator("json", createAssetSchema),
  async (c) => {
    const data = c.req.valid("json");
    const asset = await createAsset(data);
    logAudit({
      organizationId: asset.organizationId,
      actor: extractActor(c),
      action: "CREATE",
      resourceType: "asset",
      resourceId: asset.id,
      details: { name: asset.name, assetType: asset.assetType, criticality: asset.criticality },
      ipAddress: extractIp(c),
    });
    return c.json(asset, 201);
  }
);

// GET /api/v1/assets?organizationId=&type=&status=&page=&perPage=
assetRoutes.get(
  "/assets",
  zValidator("query", assetQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const result = await listAssets(query);
    return c.json(result);
  }
);

// GET /api/v1/assets/:id
assetRoutes.get("/assets/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const asset = await getAsset(id);
  return c.json(asset);
});

// PUT /api/v1/assets/:id
assetRoutes.put(
  "/assets/:id",
  zValidator("json", updateAssetSchema),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");
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
