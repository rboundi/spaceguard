import { Hono } from "hono";
import { z } from "zod";
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
  initializeComplianceMappings,
} from "../services/compliance.service";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const complianceRoutes = new Hono();

import { assertUUID, assertTenant } from "../middleware/validate";

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
    logAudit({
      organizationId: mapping.organizationId,
      actor: extractActor(c),
      action: "MAPPING_CHANGED",
      resourceType: "compliance_mapping",
      resourceId: mapping.id,
      details: {
        op: "create",
        requirementId: mapping.requirementId,
        status: mapping.status,
      },
      ipAddress: extractIp(c),
    });
    return c.json(mapping, 201);
  }
);

// GET /api/v1/compliance/mappings?organizationId=&assetId=&requirementId=&status=
complianceRoutes.get(
  "/compliance/mappings",
  zValidator("query", mappingQuerySchema),
  async (c) => {
    const filters = c.req.valid("query");
    if (filters.organizationId) assertTenant(c, filters.organizationId);
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
    logAudit({
      organizationId: mapping.organizationId,
      actor: extractActor(c),
      action: "MAPPING_CHANGED",
      resourceType: "compliance_mapping",
      resourceId: id,
      details: {
        op: "update",
        requirementId: mapping.requirementId,
        newStatus: mapping.status,
        changes: data,
      },
      ipAddress: extractIp(c),
    });
    return c.json(mapping);
  }
);

// DELETE /api/v1/compliance/mappings/:id
complianceRoutes.delete("/compliance/mappings/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const { organizationId } = await deleteMapping(id);
  logAudit({
    organizationId,
    actor: extractActor(c),
    action: "DELETE",
    resourceType: "compliance_mapping",
    resourceId: id,
    details: { op: "delete" },
    ipAddress: extractIp(c),
  });
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
  assertTenant(c, organizationId);
  const dashboard = await getDashboard(organizationId);
  return c.json(dashboard);
});

// POST /api/v1/compliance/initialize
// Creates NOT_ASSESSED org-level mappings for all requirements (onboarding)
complianceRoutes.post(
  "/compliance/initialize",
  zValidator("json", z.object({ organizationId: z.string().uuid() })),
  async (c) => {
  const body = c.req.valid("json");
  assertTenant(c, body.organizationId);
  const result = await initializeComplianceMappings(body.organizationId);
  logAudit({
    organizationId: body.organizationId,
    actor: extractActor(c),
    action: "CREATE",
    resourceType: "compliance_mapping",
    resourceId: body.organizationId,
    details: { created: result.created, total: result.total },
    ipAddress: extractIp(c),
  });
  return c.json(result);
});