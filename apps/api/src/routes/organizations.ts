import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { createOrganizationSchema, updateOrganizationSchema } from "@spaceguard/shared";
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  updateOrganization,
} from "../services/organization.service";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const organizationRoutes = new Hono();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUUID(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new HTTPException(400, { message: `${label} must be a valid UUID` });
  }
}

// POST /api/v1/organizations
organizationRoutes.post(
  "/organizations",
  zValidator("json", createOrganizationSchema),
  async (c) => {
    const data = c.req.valid("json");
    const org = await createOrganization(data);
    logAudit({
      organizationId: org.id,
      actor: extractActor(c),
      action: "CREATE",
      resourceType: "organization",
      resourceId: org.id,
      details: { name: org.name, country: org.country, nis2Classification: org.nis2Classification },
      ipAddress: extractIp(c),
    });
    return c.json(org, 201);
  }
);

// GET /api/v1/organizations
organizationRoutes.get("/organizations", async (c) => {
  const orgs = await listOrganizations();
  return c.json({ data: orgs });
});

// GET /api/v1/organizations/:id
organizationRoutes.get("/organizations/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const org = await getOrganization(id);
  return c.json(org);
});

// PUT /api/v1/organizations/:id
organizationRoutes.put(
  "/organizations/:id",
  zValidator("json", updateOrganizationSchema),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");
    const data = c.req.valid("json");
    const org = await updateOrganization(id, data);
    logAudit({
      organizationId: id,
      actor: extractActor(c),
      action: "UPDATE",
      resourceType: "organization",
      resourceId: id,
      details: { changes: data },
      ipAddress: extractIp(c),
    });
    return c.json(org);
  }
);
