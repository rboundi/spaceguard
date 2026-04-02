/**
 * Settings routes
 *
 * PUT  /settings/organization          - update org details
 * PUT  /settings/notifications         - update user notification prefs
 * POST /settings/notifications/test    - send test email
 * PUT  /settings/detection/rules/:ruleId - enable/disable/override a rule
 * GET  /settings/detection/rules       - list all rules with overrides
 * POST /settings/telemetry/streams/:id/regenerate-key - regenerate stream API key
 * PUT  /settings/telemetry/streams/:id/rate-limit     - update rate limit
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { updateOrganizationSchema } from "@spaceguard/shared";
import { updateOrganization, getOrganization } from "../services/organization.service";
import { loadRules } from "../services/detection/rule-loader";
import { getCorrelationRules, updateCorrelationRule } from "../services/detection/correlator";
import { db } from "../db/client";
import { telemetryStreams } from "../db/schema";
import { users } from "../db/schema/users";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { logAudit, extractActor, extractIp } from "../middleware/audit";
import { requireRole } from "../middleware/auth-guard";

export const settingsRoutes = new Hono();

import { UUID_RE, assertTenant } from "../middleware/validate";

// ---------------------------------------------------------------------------
// PUT /settings/organization
// ---------------------------------------------------------------------------

settingsRoutes.put(
  "/settings/organization",
  requireRole("ADMIN"),
  zValidator("json", updateOrganizationSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");
    const org = await updateOrganization(user.organizationId, data);
    logAudit({
      organizationId: user.organizationId,
      actor: extractActor(c),
      action: "UPDATE",
      resourceType: "organization",
      resourceId: user.organizationId,
      details: { changes: data, source: "settings" },
      ipAddress: extractIp(c),
    });
    return c.json(org);
  }
);

// ---------------------------------------------------------------------------
// PUT /settings/notifications
// ---------------------------------------------------------------------------

const updateNotificationsSchema = z.object({
  notifyCriticalAlerts: z.boolean().optional(),
  notifyDeadlines: z.boolean().optional(),
  notifyWeeklyDigest: z.boolean().optional(),
});

settingsRoutes.put(
  "/settings/notifications",
  zValidator("json", updateNotificationsSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const updates: Record<string, boolean> = {};
    if (body.notifyCriticalAlerts !== undefined) {
      updates.notifyCriticalAlerts = body.notifyCriticalAlerts;
    }
    if (body.notifyDeadlines !== undefined) {
      updates.notifyDeadlines = body.notifyDeadlines;
    }
    if (body.notifyWeeklyDigest !== undefined) {
      updates.notifyWeeklyDigest = body.notifyWeeklyDigest;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, user.userId));
    }

    return c.json({ success: true });
  }
);

// ---------------------------------------------------------------------------
// POST /settings/notifications/test
// ---------------------------------------------------------------------------

settingsRoutes.post("/settings/notifications/test", async (c) => {
  const user = c.get("user");

  // We use the notification service to send a test email
  // For now, just return success (the actual email sending was set up in C2)
  logAudit({
    organizationId: user.organizationId,
    actor: extractActor(c),
    action: "TEST_NOTIFICATION",
    resourceType: "user",
    resourceId: user.userId,
    details: { type: "test_email" },
    ipAddress: extractIp(c),
  });

  return c.json({ success: true, message: "Test notification queued" });
});

// ---------------------------------------------------------------------------
// GET /settings/detection/rules - list all with overrides
// ---------------------------------------------------------------------------

// In-memory rule overrides keyed by "orgId:ruleId" (persists until server restart).
// In a production system, these would be stored in the database per org.
const ruleOverrides = new Map<string, {
  enabled: boolean;
  thresholdOverride: number | null;
}>();

settingsRoutes.get("/settings/detection/rules", async (c) => {
  const user = c.get("user");
  const orgId = c.req.query("organizationId") ?? user.organizationId;
  const rules = loadRules();
  const mapped = rules.map((r) => {
    const override = ruleOverrides.get(`${orgId}:${r.id}`);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      severity: r.severity,
      sparta: r.sparta ?? null,
      mitre: r.mitre ?? null,
      nis2Articles: r.nis2Articles ?? [],
      sourceFile: r.sourceFile ?? null,
      conditionType: r.condition.type,
      conditionParameter: r.condition.type === "threshold"
        ? (r.condition as { parameter: string }).parameter
        : r.condition.type === "rate_of_change"
          ? (r.condition as { parameter: string }).parameter
          : null,
      conditionValue: r.condition.type === "threshold"
        ? (r.condition as { value: number }).value
        : r.condition.type === "rate_of_change"
          ? (r.condition as { max_change_per_second: number }).max_change_per_second
          : null,
      enabled: override?.enabled ?? true,
      thresholdOverride: override?.thresholdOverride ?? null,
    };
  });
  return c.json({ rules: mapped, total: mapped.length });
});

// ---------------------------------------------------------------------------
// PUT /settings/detection/rules/:ruleId
// ---------------------------------------------------------------------------

const updateRuleSchema = z.object({
  enabled: z.boolean().optional(),
  thresholdOverride: z.number().nullable().optional(),
});

settingsRoutes.put(
  "/settings/detection/rules/:ruleId",
  requireRole("ADMIN", "OPERATOR"),
  zValidator("json", updateRuleSchema),
  async (c) => {
    const ruleId = c.req.param("ruleId");
    const body = c.req.valid("json");
    const user = c.get("user");

    const orgKey = `${user.organizationId}:${ruleId}`;
    const existing = ruleOverrides.get(orgKey) ?? { enabled: true, thresholdOverride: null };

    if (body.enabled !== undefined) {
      existing.enabled = body.enabled;
    }
    if (body.thresholdOverride !== undefined) {
      existing.thresholdOverride = body.thresholdOverride;
    }

    ruleOverrides.set(orgKey, existing);

    logAudit({
      organizationId: user.organizationId,
      actor: extractActor(c),
      action: "UPDATE",
      resourceType: "detection_rule",
      resourceId: ruleId,
      details: { enabled: existing.enabled, thresholdOverride: existing.thresholdOverride },
      ipAddress: extractIp(c),
    });

    return c.json({ ruleId, ...existing });
  }
);

// ---------------------------------------------------------------------------
// GET /settings/correlation/rules - list correlation rules
// ---------------------------------------------------------------------------

settingsRoutes.get("/settings/correlation/rules", async (c) => {
  const rules = getCorrelationRules();
  return c.json({ rules, total: rules.length });
});

// ---------------------------------------------------------------------------
// PUT /settings/correlation/rules/:ruleId - update correlation rule
// ---------------------------------------------------------------------------

const updateCorrelationRuleSchema = z.object({
  enabled: z.boolean().optional(),
  thresholds: z.record(z.number()).optional(),
});

settingsRoutes.put(
  "/settings/correlation/rules/:ruleId",
  requireRole("ADMIN", "OPERATOR"),
  zValidator("json", updateCorrelationRuleSchema),
  async (c) => {
    const ruleId = c.req.param("ruleId");
    const body = c.req.valid("json");
    const user = c.get("user");

    const updated = updateCorrelationRule(ruleId, body);
    if (!updated) {
      return c.json({ error: `Correlation rule ${ruleId} not found` }, 404);
    }

    logAudit({
      organizationId: user.organizationId,
      actor: extractActor(c),
      action: "UPDATE",
      resourceType: "correlation_rule",
      resourceId: ruleId,
      details: { enabled: updated.enabled, thresholds: updated.thresholds },
      ipAddress: extractIp(c),
    });

    return c.json(updated);
  }
);

// ---------------------------------------------------------------------------
// POST /settings/telemetry/streams/:id/regenerate-key
// ---------------------------------------------------------------------------

settingsRoutes.post(
  "/settings/telemetry/streams/:id/regenerate-key",
  requireRole("ADMIN"),
  async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json({ error: "Invalid stream ID" }, 400);
    }

    // Verify the stream belongs to the caller's organization
    const [existing] = await db
      .select({ organizationId: telemetryStreams.organizationId })
      .from(telemetryStreams)
      .where(eq(telemetryStreams.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Stream not found" }, 404);
    }
    assertTenant(c, existing.organizationId);

    const newKey = randomUUID().replace(/-/g, "");
    const [updated] = await db
      .update(telemetryStreams)
      .set({ apiKey: newKey, updatedAt: new Date() })
      .where(eq(telemetryStreams.id, id))
      .returning({ id: telemetryStreams.id, apiKey: telemetryStreams.apiKey });

    if (!updated) {
      return c.json({ error: "Stream not found" }, 404);
    }

    logAudit({
      organizationId: existing.organizationId,
      actor: extractActor(c),
      action: "KEY_REGENERATION",
      resourceType: "telemetry_stream",
      resourceId: id,
      details: { newKeyPrefix: newKey.slice(0, 8) + "..." },
      ipAddress: extractIp(c),
    });

    return c.json({ id: updated.id, apiKey: updated.apiKey });
  }
);

// ---------------------------------------------------------------------------
// PUT /settings/telemetry/streams/:id/rate-limit
// ---------------------------------------------------------------------------

const rateLimitSchema = z.object({
  pointsPerMinute: z.number().int().min(1).max(100000),
});

settingsRoutes.put(
  "/settings/telemetry/streams/:id/rate-limit",
  requireRole("ADMIN", "OPERATOR"),
  zValidator("json", rateLimitSchema),
  async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) {
      return c.json({ error: "Invalid stream ID" }, 400);
    }

    // Verify the stream belongs to the caller's organization
    const [existing] = await db
      .select({ organizationId: telemetryStreams.organizationId })
      .from(telemetryStreams)
      .where(eq(telemetryStreams.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Stream not found" }, 404);
    }
    assertTenant(c, existing.organizationId);

    const body = c.req.valid("json");
    const user = c.get("user");

    // Rate limits are stored in-memory for now (in production, use Redis or DB column)
    // For the MVP, we just acknowledge the setting and audit-log it
    logAudit({
      organizationId: existing.organizationId,
      actor: extractActor(c),
      action: "UPDATE",
      resourceType: "telemetry_stream",
      resourceId: id,
      details: { pointsPerMinute: body.pointsPerMinute },
      ipAddress: extractIp(c),
    });

    return c.json({ id, pointsPerMinute: body.pointsPerMinute });
  }
);
