import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createIntelSchema,
  intelQuerySchema,
} from "@spaceguard/shared";
import {
  listIntel,
  getIntel,
  createIntel,
  enrichAlert,
  searchIntel,
  listTechniques,
  searchTechniques,
  getTechniqueWithCountermeasures,
  getCountermeasures,
  getCountermeasuresByNist,
} from "../services/intel.service";
import { logAudit, extractActor, extractIp } from "../middleware/audit";
import { getAlert } from "../services/detection/alert.service";

export const intelRoutes = new Hono();

import { assertUUID, assertTenant } from "../middleware/validate";

// ---------------------------------------------------------------------------
// GET /api/v1/intel
// List and filter intel objects (type, source, tactic, free-text search)
// ---------------------------------------------------------------------------

intelRoutes.get(
  "/intel",
  zValidator("query", intelQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const result = await listIntel(query);
    return c.json({ data: result.data, total: result.total });
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/intel/search?q=<text>&limit=<n>
// Quick free-text search endpoint (separate from the paginated list)
// ---------------------------------------------------------------------------

intelRoutes.get(
  "/intel/search",
  zValidator(
    "query",
    z.object({
      q:     z.string().min(1).max(200),
      limit: z.coerce.number().int().positive().max(50).default(20),
    })
  ),
  async (c) => {
    const { q, limit } = c.req.valid("query");
    const results = await searchIntel(q, limit);
    return c.json({ data: results, total: results.length });
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/intel/:id
// Fetch a single intel object by SpaceGuard UUID
// ---------------------------------------------------------------------------

intelRoutes.get("/intel/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const intel = await getIntel(id);
  return c.json(intel);
});

// ---------------------------------------------------------------------------
// POST /api/v1/intel
// Manually create or upsert a STIX intel object
// ---------------------------------------------------------------------------

intelRoutes.post(
  "/intel",
  zValidator("json", createIntelSchema),
  async (c) => {
    const data = c.req.valid("json");
    const intel = await createIntel(data);
    const user = c.get("user");
    logAudit({
      organizationId: user.organizationId,
      actor: extractActor(c),
      action: "CREATE",
      resourceType: "threat_intel",
      resourceId: intel.id,
      details: { stixType: intel.stixType, name: intel.name },
      ipAddress: extractIp(c),
    });
    return c.json(intel, 201);
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/intel/enrich/alert/:alertId
// Return SPARTA enrichment context for a given alert
// ---------------------------------------------------------------------------

intelRoutes.get("/intel/enrich/alert/:alertId", async (c) => {
  const alertId = c.req.param("alertId");
  assertUUID(alertId, "alertId");
  // Verify the alert belongs to the caller's organization
  const alert = await getAlert(alertId);
  assertTenant(c, alert.organizationId);
  const enrichment = await enrichAlert(alertId);
  return c.json(enrichment);
});

// ---------------------------------------------------------------------------
// GET /api/v1/intel/tactics/:tacticId/techniques
// Return all SPARTA techniques for a given tactic (by STIX ID or phase name)
// ---------------------------------------------------------------------------

intelRoutes.get("/intel/tactics/:tacticId/techniques", async (c) => {
  const tacticId = c.req.param("tacticId");
  if (!tacticId || !tacticId.trim()) {
    throw new HTTPException(400, { message: "tacticId is required" });
  }
  const techniques = await listTechniques(tacticId);
  return c.json({ data: techniques, total: techniques.length });
});

// ---------------------------------------------------------------------------
// GET /api/v1/intel/techniques/search?q=<text>&limit=<n>
// Full-text search restricted to SPARTA attack-pattern objects
// ---------------------------------------------------------------------------

intelRoutes.get(
  "/intel/techniques/search",
  zValidator(
    "query",
    z.object({
      q:     z.string().min(1).max(200),
      limit: z.coerce.number().int().positive().max(100).default(20),
    })
  ),
  async (c) => {
    const { q, limit } = c.req.valid("query");
    const results = await searchTechniques(q, limit);
    return c.json({ data: results, total: results.length });
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/intel/techniques/:id
// Return a technique with its sub-techniques and countermeasures
// Accepts a SpaceGuard UUID or a STIX ID (attack-pattern--<uuid>)
// ---------------------------------------------------------------------------

intelRoutes.get("/intel/techniques/:id", async (c) => {
  const id = c.req.param("id");
  if (!id || !id.trim()) {
    throw new HTTPException(400, { message: "id parameter is required" });
  }
  const detail = await getTechniqueWithCountermeasures(id);
  return c.json(detail);
});

// ---------------------------------------------------------------------------
// GET /api/v1/intel/techniques/:stixId/countermeasures
// Return all countermeasures mapped to a technique (by STIX ID)
// ---------------------------------------------------------------------------

intelRoutes.get("/intel/techniques/:stixId/countermeasures", async (c) => {
  const stixId = c.req.param("stixId");
  const countermeasures = await getCountermeasures(stixId);
  return c.json({ data: countermeasures, total: countermeasures.length });
});

// ---------------------------------------------------------------------------
// GET /api/v1/intel/countermeasures/nist/:controlId
// Find countermeasures mapped to a NIST SP 800-53 control (e.g. "AC-2")
// ---------------------------------------------------------------------------

intelRoutes.get("/intel/countermeasures/nist/:controlId", async (c) => {
  const controlId = c.req.param("controlId");
  if (!controlId || controlId.length > 20) {
    throw new HTTPException(400, { message: "controlId must be 1-20 characters" });
  }
  const countermeasures = await getCountermeasuresByNist(controlId);
  return c.json({ data: countermeasures, total: countermeasures.length });
});
