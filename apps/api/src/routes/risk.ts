import { Hono } from "hono";
import { assertTenant, UUID_RE } from "../middleware/validate";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { spaceAssets } from "../db/schema/assets";
import {
  calculateAssetRisk,
  calculateOrgRisk,
  getRiskOverview,
  storeRiskSnapshot,
} from "../services/risk.service";

export const riskRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /risk/assets/:id
// ---------------------------------------------------------------------------

riskRoutes.get("/risk/assets/:id", async (c) => {
  const { id } = c.req.param();
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid asset ID" }, 400);

  // Tenant check: look up the asset's org
  const [asset] = await db
    .select({ organizationId: spaceAssets.organizationId })
    .from(spaceAssets)
    .where(eq(spaceAssets.id, id))
    .limit(1);

  if (!asset) return c.json({ error: "Asset not found" }, 404);
  assertTenant(c, asset.organizationId);

  const risk = await calculateAssetRisk(id);

  return c.json({
    assetId: risk.assetId,
    assetName: risk.assetName,
    assetType: risk.assetType,
    criticality: risk.criticality,
    risk: {
      overall: risk.overall,
      breakdown: risk.breakdown,
      trend: risk.trend,
      topRisks: risk.topRisks,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /risk/organization?organizationId=xxx
// ---------------------------------------------------------------------------

riskRoutes.get("/risk/organization", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId is required" }, 400);
  if (!UUID_RE.test(organizationId)) return c.json({ error: "Invalid organizationId" }, 400);
  assertTenant(c, organizationId);

  const orgRisk = await calculateOrgRisk(organizationId);
  return c.json(orgRisk);
});

// ---------------------------------------------------------------------------
// GET /risk/overview?organizationId=xxx
// ---------------------------------------------------------------------------

riskRoutes.get("/risk/overview", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId is required" }, 400);
  if (!UUID_RE.test(organizationId)) return c.json({ error: "Invalid organizationId" }, 400);
  assertTenant(c, organizationId);

  const overview = await getRiskOverview(organizationId);
  return c.json(overview);
});

// ---------------------------------------------------------------------------
// POST /risk/snapshot?organizationId=xxx  (store a historical snapshot)
// ---------------------------------------------------------------------------

riskRoutes.post("/risk/snapshot", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId is required" }, 400);
  if (!UUID_RE.test(organizationId)) return c.json({ error: "Invalid organizationId" }, 400);
  assertTenant(c, organizationId);

  await storeRiskSnapshot(organizationId);
  return c.json({ success: true, message: "Risk snapshot stored" });
});
