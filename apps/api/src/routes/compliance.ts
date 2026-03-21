import { Hono } from "hono";
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
} from "../services/compliance.service";

export const complianceRoutes = new Hono();

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
  const requirement = await getRequirement(c.req.param("id"));
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
    const data = c.req.valid("json");
    const mapping = await updateMapping(c.req.param("id"), data);
    return c.json(mapping);
  }
);

// DELETE /api/v1/compliance/mappings/:id
complianceRoutes.delete("/compliance/mappings/:id", async (c) => {
  await deleteMapping(c.req.param("id"));
  return c.json({ success: true });
});
