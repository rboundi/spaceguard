import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { LifecyclePhase } from "@spaceguard/shared";
import {
  getPhaseRequirements,
  transitionPhase,
  getSecurityMilestones,
  getTlptSchedule,
  getFleetLifecycle,
} from "../services/lifecycle.service";
import { assertUUID, assertTenant } from "../middleware/validate";
import { extractActor, extractIp } from "../middleware/audit";

export const lifecycleRoutes = new Hono();

// GET /lifecycle/fleet - fleet lifecycle overview
lifecycleRoutes.get("/lifecycle/fleet", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);

  const fleet = await getFleetLifecycle(organizationId);
  return c.json({ data: fleet, total: fleet.length });
});

// GET /lifecycle/requirements/:phase - controls for a phase
lifecycleRoutes.get("/lifecycle/requirements/:phase", async (c) => {
  const phase = c.req.param("phase");
  const requirements = await getPhaseRequirements(phase);
  return c.json(requirements);
});

// GET /lifecycle/phases/:assetId - current phase + milestones
lifecycleRoutes.get("/lifecycle/phases/:assetId", async (c) => {
  const assetId = c.req.param("assetId");
  assertUUID(assetId, "assetId");

  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertTenant(c, organizationId);

  const milestones = await getSecurityMilestones(assetId, organizationId);
  return c.json({ milestones });
});

// POST /lifecycle/phases/:assetId/transition - advance phase
const transitionSchema = z.object({
  newPhase: z.nativeEnum(LifecyclePhase),
});

lifecycleRoutes.post(
  "/lifecycle/phases/:assetId/transition",
  zValidator("json", transitionSchema),
  async (c) => {
    const assetId = c.req.param("assetId");
    assertUUID(assetId, "assetId");

    const user = c.get("user");
    const organizationId = c.req.query("organizationId") ?? user.organizationId;
    assertTenant(c, organizationId);

    const { newPhase } = c.req.valid("json");
    const result = await transitionPhase(assetId, newPhase, extractActor(c), organizationId);

    return c.json(result);
  }
);

// GET /lifecycle/milestones/:assetId
lifecycleRoutes.get("/lifecycle/milestones/:assetId", async (c) => {
  const assetId = c.req.param("assetId");
  assertUUID(assetId, "assetId");

  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertTenant(c, organizationId);

  const milestones = await getSecurityMilestones(assetId, organizationId);
  return c.json({ data: milestones });
});

// GET /lifecycle/tlpt-schedule
lifecycleRoutes.get("/lifecycle/tlpt-schedule", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);

  const schedule = await getTlptSchedule(organizationId);
  return c.json({ data: schedule, total: schedule.length });
});
