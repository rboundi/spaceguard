import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createProfile,
  getProfile,
  listProfiles,
  deleteProfile,
  generateTailoredBaseline,
} from "../services/tailoring/tailoring.service";
import { assertUUID, assertTenant } from "../middleware/validate";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const tailoringRoutes = new Hono();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createProfileSchema = z.object({
  organizationId: z.string().uuid(),
  assetId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  missionType: z.enum([
    "EARTH_OBSERVATION", "COMMUNICATIONS", "NAVIGATION",
    "IOT", "SSA", "SCIENCE", "DEFENSE", "OTHER",
  ]),
  orbitRegime: z.enum([
    "LEO", "MEO", "GEO", "HEO", "SSO", "CISLUNAR", "GROUND_ONLY",
  ]),
  adversaryCapability: z.enum([
    "OPPORTUNISTIC", "ORGANIZED_CRIME", "NATION_STATE_TIER1", "NATION_STATE_TIER2",
  ]).optional(),
  spacecraftConstraints: z.object({
    has_crypto_capability: z.boolean().optional(),
    supports_firmware_update: z.boolean().optional(),
    has_onboard_storage: z.boolean().optional(),
    has_inter_satellite_links: z.boolean().optional(),
    supports_autonomous_operations: z.boolean().optional(),
    max_uplink_bandwidth_kbps: z.number().optional(),
    processing_power: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  }).optional(),
  groundSegmentProfile: z.object({
    uses_shared_ground_stations: z.boolean().optional(),
    cloud_hosted_operations: z.boolean().optional(),
    has_dedicated_soc: z.boolean().optional(),
    staff_count: z.number().optional(),
    geographic_distribution: z.string().optional(),
  }).optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// List profiles
tailoringRoutes.get("/tailoring/profiles", async (c) => {
  const user = c.get("user");
  const organizationId = c.req.query("organizationId") ?? user.organizationId;
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);

  const profiles = await listProfiles(organizationId);
  return c.json({ data: profiles, total: profiles.length });
});

// Get single profile
tailoringRoutes.get("/tailoring/profiles/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const profile = await getProfile(id);
  assertTenant(c, profile.organizationId);
  return c.json(profile);
});

// Create profile
tailoringRoutes.post(
  "/tailoring/profiles",
  zValidator("json", createProfileSchema),
  async (c) => {
    const data = c.req.valid("json");
    assertTenant(c, data.organizationId);

    const profile = await createProfile(data);

    logAudit({
      organizationId: data.organizationId,
      actor: extractActor(c),
      action: "CREATE",
      resourceType: "threat_profile",
      resourceId: profile.id,
      details: { name: data.name, missionType: data.missionType },
      ipAddress: extractIp(c),
    });

    return c.json(profile, 201);
  }
);

// Delete profile
tailoringRoutes.delete("/tailoring/profiles/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const profile = await getProfile(id);
  assertTenant(c, profile.organizationId);

  await deleteProfile(id);

  logAudit({
    organizationId: profile.organizationId,
    actor: extractActor(c),
    action: "DELETE",
    resourceType: "threat_profile",
    resourceId: id,
    details: { name: profile.name },
    ipAddress: extractIp(c),
  });

  return c.json({ success: true });
});

// Generate tailored baseline
tailoringRoutes.post("/tailoring/profiles/:id/generate", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const profile = await getProfile(id);
  assertTenant(c, profile.organizationId);

  const baseline = await generateTailoredBaseline(id);

  logAudit({
    organizationId: profile.organizationId,
    actor: extractActor(c),
    action: "CREATE",
    resourceType: "tailored_baseline",
    resourceId: id,
    details: {
      profileName: profile.name,
      techniques: baseline.techniqueCount.applicable,
      controls: baseline.controlBaseline.total,
    },
    ipAddress: extractIp(c),
  });

  return c.json(baseline);
});

// Get baseline (cached from last generation)
tailoringRoutes.get("/tailoring/profiles/:id/baseline", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const profile = await getProfile(id);
  assertTenant(c, profile.organizationId);

  if (!profile.generatedBaseline) {
    return c.json({ error: "No baseline generated yet. POST /generate first." }, 404);
  }

  return c.json(profile.generatedBaseline);
});

// Get gaps (controls not yet compliant)
tailoringRoutes.get("/tailoring/profiles/:id/gaps", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const profile = await getProfile(id);
  assertTenant(c, profile.organizationId);

  if (!profile.generatedBaseline) {
    return c.json({ error: "No baseline generated yet. POST /generate first." }, 404);
  }

  const baseline = profile.generatedBaseline as unknown as {
    controlBaseline: { controls: Array<{ controlId: string; alreadyCompliant: boolean; countermeasures: string[] }> };
    recommendations: unknown[];
  };

  const gaps = baseline.controlBaseline.controls.filter((c) => !c.alreadyCompliant);

  return c.json({
    totalControls: baseline.controlBaseline.controls.length,
    gapCount: gaps.length,
    gaps,
    recommendations: baseline.recommendations,
  });
});
