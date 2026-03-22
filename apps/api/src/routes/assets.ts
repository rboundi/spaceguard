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
    return c.json(asset);
  }
);

// DELETE /api/v1/assets/:id  (soft delete - sets status to DECOMMISSIONED)
assetRoutes.delete("/assets/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const asset = await deleteAsset(id);
  return c.json(asset);
});
