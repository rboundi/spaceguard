/**
 * Alert routes - Module 3: Detection Engine
 *
 * GET  /alerts             - paginated list with filters
 * GET  /alerts/stats       - counts by severity/status for an organization
 * GET  /alerts/:id         - single alert
 * PUT  /alerts/:id         - update status / resolvedBy
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  alertQuerySchema,
  updateAlertSchema,
} from "@spaceguard/shared";
import {
  listAlerts,
  getAlert,
  updateAlert,
  getAlertStats,
} from "../services/detection/alert.service";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const alertRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /alerts/stats?organizationId=
// MUST be defined before /alerts/:id so "stats" is not treated as an id
// ---------------------------------------------------------------------------

alertRoutes.get(
  "/alerts/stats",
  zValidator(
    "query",
    z.object({ organizationId: z.string().uuid() })
  ),
  async (c) => {
    const { organizationId } = c.req.valid("query");
    const stats = await getAlertStats(organizationId);
    return c.json(stats);
  }
);

// ---------------------------------------------------------------------------
// GET /alerts
// ---------------------------------------------------------------------------

alertRoutes.get(
  "/alerts",
  zValidator("query", alertQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const result = await listAlerts(query);
    return c.json(result);
  }
);

// ---------------------------------------------------------------------------
// GET /alerts/:id
// ---------------------------------------------------------------------------

alertRoutes.get(
  "/alerts/:id",
  zValidator("param", z.object({ id: z.string().uuid() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const alert = await getAlert(id);
    return c.json(alert);
  }
);

// ---------------------------------------------------------------------------
// PUT /alerts/:id
// ---------------------------------------------------------------------------

alertRoutes.put(
  "/alerts/:id",
  zValidator("param", z.object({ id: z.string().uuid() })),
  zValidator("json", updateAlertSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const updated = await updateAlert(id, body);
    const isAck = body.status === "RESOLVED" || body.status === "FALSE_POSITIVE";
    logAudit({
      organizationId: updated.organizationId,
      actor: extractActor(c),
      action: isAck ? "ALERT_ACKNOWLEDGED" : "STATUS_CHANGE",
      resourceType: "alert",
      resourceId: id,
      details: { newStatus: body.status, ruleId: updated.ruleId, title: updated.title },
      ipAddress: extractIp(c),
    });
    return c.json(updated);
  }
);
