import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import {
  requirementQuerySchema,
  mappingQuerySchema,
  createMappingSchema,
  updateMappingSchema,
} from "@spaceguard/shared";
import {
  listRequirements,
  getRequirement,
  createMapping,
  updateMapping,
  deleteMapping,
  listMappings,
  getDashboard,
} from "../services/compliance.service";

export const complianceRoutes = new Hono();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUUID(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new HTTPException(400, { message: `${label} must be a valid UUID` });
  }
}

// -------------------------------------------------------------------------
// Requirements (read-only)
// -------------------------------------------------------------------------

// GET /api/v1/compliance/requirements?regulation=NIS2&category=Risk+Management
complianceRoutes.get(
  "/compliance/requirements",
  zValidator("query", requirementQuerySchema),
  async (c) => {
    const { regulation, category } = c.req.valid("query");
    const requirements = await listRequirements({ regulation, category });
    return c.json({ data: requirements });
  }
);

// GET /api/v1/compliance/requirements/:id
complianceRoutes.get("/compliance/requirements/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const requirement = await getRequirement(id);
  return c.json(requirement);
});

// -------------------------------------------------------------------------
// Mappings (full CRUD)
// -------------------------------------------------------------------------

// POST /api/v1/compliance/mappings
complianceRoutes.post(
  "/compliance/mappings",
  zValidator("json", createMappingSchema),
  async (c) => {
    const data = c.req.valid("json");
    const mapping = await createMapping(data);
    return c.json(mapping, 201);
  }
);

// GET /api/v1/compliance/mappings?organizationId=&assetId=&requirementId=&status=
complianceRoutes.get(
  "/compliance/mappings",
  zValidator("query", mappingQuerySchema),
  async (c) => {
    const filters = c.req.valid("query");
    const mappings = await listMappings(filters);
    return c.json({ data: mappings });
  }
);

// PUT /api/v1/compliance/mappings/:id
complianceRoutes.put(
  "/compliance/mappings/:id",
  zValidator("json", updateMappingSchema),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");
    const data = c.req.valid("json");
    const mapping = await updateMapping(id, data);
    return c.json(mapping);
  }
);

// DELETE /api/v1/compliance/mappings/:id
complianceRoutes.delete("/compliance/mappings/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  await deleteMapping(id);
  return c.json({ success: true });
});

// -------------------------------------------------------------------------
// Dashboard
// -------------------------------------------------------------------------

// GET /api/v1/compliance/dashboard?organizationId=
complianceRoutes.get("/compliance/dashboard", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) {
    return c.json({ error: "organizationId query parameter is required" }, 400);
  }
  assertUUID(organizationId, "organizationId");
  const dashboard = await getDashboard(organizationId);
  return c.json(dashboard);
});
