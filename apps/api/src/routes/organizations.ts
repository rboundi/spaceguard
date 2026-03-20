import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createOrganizationSchema, updateOrganizationSchema } from "@spaceguard/shared";
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  updateOrganization,
} from "../services/organization.service";

export const organizationRoutes = new Hono();

// POST /api/v1/organizations
organizationRoutes.post(
  "/organizations",
  zValidator("json", createOrganizationSchema),
  async (c) => {
    const data = c.req.valid("json");
    const org = await createOrganization(data);
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
  const org = await getOrganization(c.req.param("id"));
  return c.json(org);
});

// PUT /api/v1/organizations/:id
organizationRoutes.put(
  "/organizations/:id",
  zValidator("json", updateOrganizationSchema),
  async (c) => {
    const data = c.req.valid("json");
    const org = await updateOrganization(c.req.param("id"), data);
    return c.json(org);
  }
);
