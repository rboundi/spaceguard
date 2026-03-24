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
} from "../services/intel.service";

export const intelRoutes = new Hono();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUUID(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new HTTPException(400, { message: `${label} must be a valid UUID` });
  }
}

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
  const enrichment = await enrichAlert(alertId);
  return c.json(enrichment);
});
