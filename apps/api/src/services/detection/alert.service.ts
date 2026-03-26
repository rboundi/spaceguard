/**
 * Alert Service
 *
 * Provides:
 *  - createAlert        - insert alert with 5-minute deduplication window
 *  - getAlert           - fetch single alert by id
 *  - listAlerts         - paginated list with filters
 *  - updateAlert        - change status / resolvedBy
 *  - getAlertStats      - counts grouped by severity and status
 *  - publishAlert       - emit alert to Redis pub/sub channel alerts:{orgId}
 *
 * Deduplication: if an alert with the same (ruleId, streamId) already exists
 * in NEW or INVESTIGATING status and was triggered within the last 5 minutes,
 * the new payload is silently dropped (returns null).
 */

import { eq, and, gte, lte, count, desc, ilike, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { Redis } from "ioredis";
import { db } from "../../db/client";
import { alerts } from "../../db/schema/alerts";
import type { Alert } from "../../db/schema/alerts";
import type {
  CreateAlert,
  UpdateAlert,
  AlertResponse,
  AlertQuery,
} from "@spaceguard/shared";
import { createIncidentFromAlert } from "../incident.service";
import { sendAlertNotification } from "../notification.service";
import { correlateAlert } from "./correlator";

// ---------------------------------------------------------------------------
// Redis client (lazily initialised, shared singleton)
// ---------------------------------------------------------------------------

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      // Don't crash the process if Redis is unavailable
      enableOfflineQueue: false,
    });
    redisClient.on("error", (err: Error) => {
      console.error("[alert-service] Redis error:", err.message);
    });
  }
  return redisClient;
}

// ---------------------------------------------------------------------------
// Response mapper
// ---------------------------------------------------------------------------

function alertToResponse(row: Alert): AlertResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    streamId: row.streamId ?? null,
    ruleId: row.ruleId,
    severity: row.severity as AlertResponse["severity"],
    title: row.title,
    description: row.description,
    status: row.status as AlertResponse["status"],
    spartaTactic: row.spartaTactic ?? null,
    spartaTechnique: row.spartaTechnique ?? null,
    affectedAssetId: row.affectedAssetId ?? null,
    triggeredAt: row.triggeredAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns true if a recent open alert already exists for this (ruleId, streamId).
 */
async function isDuplicate(
  ruleId: string,
  streamId: string | undefined,
  organizationId: string
): Promise<boolean> {
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);

  const conditions = [
    eq(alerts.organizationId, organizationId),
    eq(alerts.ruleId, ruleId),
    gte(alerts.triggeredAt, windowStart),
    // Only consider open alerts
    inArray(alerts.status, ["NEW", "INVESTIGATING"]),
  ];

  if (streamId) {
    conditions.push(eq(alerts.streamId, streamId));
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(alerts)
    .where(and(...conditions));

  return Number(total) > 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new alert after checking for duplicates.
 * Returns the created alert, or null if deduplicated.
 */
export async function createAlert(data: CreateAlert): Promise<AlertResponse | null> {
  // Deduplication check
  if (await isDuplicate(data.ruleId, data.streamId, data.organizationId)) {
    return null;
  }

  const [row] = await db
    .insert(alerts)
    .values({
      organizationId: data.organizationId,
      streamId: data.streamId ?? null,
      ruleId: data.ruleId,
      severity: data.severity as Alert["severity"],
      title: data.title,
      description: data.description,
      status: "NEW",
      spartaTactic: data.spartaTactic ?? null,
      spartaTechnique: data.spartaTechnique ?? null,
      affectedAssetId: data.affectedAssetId ?? null,
      triggeredAt: data.triggeredAt ? new Date(data.triggeredAt) : new Date(),
      metadata: data.metadata ?? null,
    })
    .returning();

  const response = alertToResponse(row);

  // Auto-create incident for HIGH/CRITICAL alerts (fire-and-forget)
  if (row.severity === "HIGH" || row.severity === "CRITICAL") {
    createIncidentFromAlert(row.id, row.organizationId).catch((err: unknown) => {
      console.error("[alert-service] Failed to auto-create incident:", err);
    });

    // Email notification for CRITICAL/HIGH alerts (fire-and-forget)
    sendAlertNotification({
      id: row.id,
      title: row.title,
      severity: row.severity,
      organizationId: row.organizationId,
      affectedAssetId: row.affectedAssetId,
      spartaTactics: row.spartaTactic ? [row.spartaTactic] : [],
      spartaTechniques: row.spartaTechnique ? [row.spartaTechnique] : [],
      triggeredAt: row.triggeredAt,
    }).catch((err: unknown) => {
      console.error("[alert-service] Failed to send alert notification:", err);
    });
  }

  // Fire-and-forget Redis publish
  publishAlert(data.organizationId, response).catch((err: unknown) => {
    console.error("[alert-service] Failed to publish alert to Redis:", err);
  });

  // Fire-and-forget alert correlation (runs for ALL alerts, not just HIGH/CRITICAL)
  correlateAlert(response).catch((err: unknown) => {
    console.error("[alert-service] Failed to correlate alert:", err);
  });

  return response;
}

/**
 * Retrieves a single alert by ID. Throws 404 if not found.
 */
export async function getAlert(id: string): Promise<AlertResponse> {
  const [row] = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: `Alert ${id} not found` });
  }

  return alertToResponse(row);
}

/**
 * Paginated list of alerts with optional filters.
 */
export async function listAlerts(
  query: AlertQuery
): Promise<{ data: AlertResponse[]; total: number }> {
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 20;
  const offset = (page - 1) * perPage;

  const conditions = [eq(alerts.organizationId, query.organizationId)];

  if (query.status) {
    conditions.push(
      eq(alerts.status, query.status as Alert["status"])
    );
  }
  if (query.severity) {
    conditions.push(
      eq(alerts.severity, query.severity as Alert["severity"])
    );
  }
  if (query.streamId) {
    conditions.push(eq(alerts.streamId, query.streamId));
  }
  if (query.affectedAssetId) {
    conditions.push(eq(alerts.affectedAssetId, query.affectedAssetId));
  }
  if (query.ruleId) {
    conditions.push(eq(alerts.ruleId, query.ruleId));
  }
  if (query.spartaTactic) {
    conditions.push(ilike(alerts.spartaTactic, `%${query.spartaTactic}%`));
  }
  if (query.spartaTechnique) {
    conditions.push(ilike(alerts.spartaTechnique, `%${query.spartaTechnique}%`));
  }
  if (query.from) {
    conditions.push(gte(alerts.triggeredAt, new Date(query.from)));
  }
  if (query.to) {
    conditions.push(lte(alerts.triggeredAt, new Date(query.to)));
  }

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(alerts)
      .where(where)
      .orderBy(desc(alerts.triggeredAt))
      .limit(perPage)
      .offset(offset),
    db.select({ total: count() }).from(alerts).where(where),
  ]);

  return { data: rows.map(alertToResponse), total: Number(total) };
}

/**
 * Updates alert status and/or resolvedBy.
 * Automatically sets resolvedAt when transitioning to RESOLVED or FALSE_POSITIVE.
 */
export async function updateAlert(
  id: string,
  data: UpdateAlert
): Promise<AlertResponse> {
  // Verify it exists
  await getAlert(id);

  const resolvedStatuses = ["RESOLVED", "FALSE_POSITIVE"] as const;
  const isResolving =
    data.status &&
    (resolvedStatuses as readonly string[]).includes(data.status);

  const [row] = await db
    .update(alerts)
    .set({
      ...(data.status && { status: data.status as Alert["status"] }),
      ...(data.resolvedBy && { resolvedBy: data.resolvedBy }),
      ...(data.metadata && { metadata: data.metadata }),
      ...(isResolving && { resolvedAt: new Date() }),
      updatedAt: new Date(),
    })
    .where(eq(alerts.id, id))
    .returning();

  return alertToResponse(row);
}

// ---------------------------------------------------------------------------
// Stats endpoint helper
// ---------------------------------------------------------------------------

export interface AlertStats {
  total: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  openCritical: number;
  openHigh: number;
}

/**
 * Returns aggregated alert counts for an organization.
 */
export async function getAlertStats(organizationId: string): Promise<AlertStats> {
  // Four queries in parallel
  const [bySeverityRows, byStatusRows, [{ openCritical }], [{ openHigh }]] =
    await Promise.all([
      db
        .select({ severity: alerts.severity, cnt: count() })
        .from(alerts)
        .where(eq(alerts.organizationId, organizationId))
        .groupBy(alerts.severity),
      db
        .select({ status: alerts.status, cnt: count() })
        .from(alerts)
        .where(eq(alerts.organizationId, organizationId))
        .groupBy(alerts.status),
      db
        .select({ openCritical: count() })
        .from(alerts)
        .where(
          and(
            eq(alerts.organizationId, organizationId),
            eq(alerts.severity, "CRITICAL"),
            inArray(alerts.status, ["NEW", "INVESTIGATING"])
          )
        ),
      db
        .select({ openHigh: count() })
        .from(alerts)
        .where(
          and(
            eq(alerts.organizationId, organizationId),
            eq(alerts.severity, "HIGH"),
            inArray(alerts.status, ["NEW", "INVESTIGATING"])
          )
        ),
    ]);

  const bySeverity: Record<string, number> = {};
  let total = 0;
  for (const r of bySeverityRows) {
    bySeverity[r.severity] = Number(r.cnt);
    total += Number(r.cnt);
  }

  const byStatus: Record<string, number> = {};
  for (const r of byStatusRows) {
    byStatus[r.status] = Number(r.cnt);
  }

  return {
    total,
    bySeverity,
    byStatus,
    openCritical: Number(openCritical),
    openHigh: Number(openHigh),
  };
}

// ---------------------------------------------------------------------------
// Redis pub/sub
// ---------------------------------------------------------------------------

/**
 * Publishes an alert to the Redis channel `alerts:{organizationId}`.
 * Consumers (e.g. WebSocket gateway) subscribe to this channel.
 */
export async function publishAlert(
  organizationId: string,
  alert: AlertResponse
): Promise<void> {
  try {
    const redis = getRedis();
    const channel = `alerts:${organizationId}`;
    await redis.publish(channel, JSON.stringify(alert));
  } catch (err) {
    // Non-fatal: log and continue - the alert is already in the DB
    console.error("[alert-service] Redis publish failed:", err);
  }
}
