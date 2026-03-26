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
  getBaselineStreamId,
} from "../services/detection/anomaly-detector";
import { assertUUID, assertTenant } from "../middleware/validate";
import { db } from "../db/client";
import { telemetryStreams } from "../db/schema";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

export const anomalyRoutes = new Hono();

/** Look up the organization that owns a telemetry stream. */
async function getStreamOrgId(streamId: string): Promise<string> {
  const [stream] = await db
    .select({ organizationId: telemetryStreams.organizationId })
    .from(telemetryStreams)
    .where(eq(telemetryStreams.id, streamId))
    .limit(1);
  if (!stream) {
    throw new HTTPException(404, { message: `Stream ${streamId} not found` });
  }
  return stream.organizationId;
}

// ---------------------------------------------------------------------------
// GET /api/v1/anomaly/baselines?streamId=
// View current baselines for a telemetry stream.
// ---------------------------------------------------------------------------

anomalyRoutes.get(
  "/anomaly/baselines",
  zValidator("query", baselineQuerySchema),
  async (c) => {
    const { streamId } = c.req.valid("query");
    const orgId = await getStreamOrgId(streamId);
    assertTenant(c, orgId);
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
    const streamId = await getBaselineStreamId(id);
    const orgId = await getStreamOrgId(streamId);
    assertTenant(c, orgId);
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
    const orgId = await getStreamOrgId(streamId);
    assertTenant(c, orgId);
    const stats = await getAnomalyStats(streamId);
    return c.json({
      ...stats,
      learningModeUntil: stats.learningModeUntil?.toISOString() ?? null,
    });
  }
);
