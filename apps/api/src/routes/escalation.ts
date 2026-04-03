import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  evaluateEscalation,
  escalateIncident,
  updateCsirtStatus,
  CRISIS_TEMPLATES,
} from "../services/escalation.service";
import { assertUUID, assertTenant } from "../middleware/validate";
import { extractActor } from "../middleware/audit";

export const escalationRoutes = new Hono();

// Evaluate auto-escalation criteria
escalationRoutes.get("/escalation/evaluate/:incidentId", async (c) => {
  const incidentId = c.req.param("incidentId");
  assertUUID(incidentId, "incidentId");
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertTenant(c, organizationId);

  const result = await evaluateEscalation(incidentId, organizationId);
  return c.json(result);
});

// Escalate incident
const escalateSchema = z.object({
  newLevel: z.enum(["LARGE_SCALE_INCIDENT", "CYBER_CRISIS"]),
  reason: z.string().min(1).max(2000),
});

escalationRoutes.post(
  "/escalation/escalate/:incidentId",
  zValidator("json", escalateSchema),
  async (c) => {
    const incidentId = c.req.param("incidentId");
    assertUUID(incidentId, "incidentId");
    const user = c.get("user");
    const organizationId = c.req.query("organizationId") ?? user.organizationId;
    assertTenant(c, organizationId);

    const { newLevel, reason } = c.req.valid("json");
    const result = await escalateIncident(
      incidentId,
      newLevel,
      reason,
      extractActor(c),
      organizationId,
    );
    return c.json(result);
  }
);

// Update CSIRT notification status
const csirtSchema = z.object({
  status: z.enum(["NOT_REQUIRED", "PENDING", "NOTIFIED", "ACKNOWLEDGED"]),
  csirtContact: z.string().max(255).nullable().optional(),
});

escalationRoutes.post(
  "/escalation/csirt/:incidentId",
  zValidator("json", csirtSchema),
  async (c) => {
    const incidentId = c.req.param("incidentId");
    assertUUID(incidentId, "incidentId");
    const user = c.get("user");
    const organizationId = c.req.query("organizationId") ?? user.organizationId;
    assertTenant(c, organizationId);

    const { status, csirtContact } = c.req.valid("json");
    const result = await updateCsirtStatus(
      incidentId,
      status,
      csirtContact ?? null,
      extractActor(c),
      organizationId,
    );
    return c.json(result);
  }
);

// Get crisis communication templates
escalationRoutes.get("/escalation/templates", async (c) => {
  return c.json({ data: CRISIS_TEMPLATES });
});
