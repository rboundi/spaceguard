/**
 * Anomaly detection API routes.
 *
 * Provides endpoints for viewing and managing telemetry baselines
 * and anomaly detection statistics.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  baselineQuerySchema,
  anomalyStatsQuerySchema,
  updateBaselineSchema,
} from "@spaceguard/shared";
import {
  getBaselines,
  updateBaselineManual,
  getAnomalyStats,
} from "../services/detection/anomaly-detector";
import { assertUUID } from "../middleware/validate";

export const anomalyRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /api/v1/anomaly/baselines?streamId=
// View current baselines for a telemetry stream.
// ---------------------------------------------------------------------------

anomalyRoutes.get(
  "/anomaly/baselines",
  zValidator("query", baselineQuerySchema),
  async (c) => {
    const { streamId } = c.req.valid("query");
    const baselines = await getBaselines(streamId);
    return c.json({ data: baselines, total: baselines.length });
  }
);

// ---------------------------------------------------------------------------
// PUT /api/v1/anomaly/baselines/:id
// Manually adjust a baseline (operator override).
// ---------------------------------------------------------------------------

anomalyRoutes.put(
  "/anomaly/baselines/:id",
  zValidator("json", updateBaselineSchema),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");
    const updates = c.req.valid("json");
    const baseline = await updateBaselineManual(id, updates);
    return c.json(baseline);
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/anomaly/stats?streamId=
// Anomaly detection statistics for a stream.
// ---------------------------------------------------------------------------

anomalyRoutes.get(
  "/anomaly/stats",
  zValidator("query", anomalyStatsQuerySchema),
  async (c) => {
    const { streamId } = c.req.valid("query");
    const stats = await getAnomalyStats(streamId);
    return c.json({
      ...stats,
      learningModeUntil: stats.learningModeUntil?.toISOString() ?? null,
    });
  }
);
