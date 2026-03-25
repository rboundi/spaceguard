import { eq, and, gte, lte, count, desc } from "drizzle-orm";
import { db } from "../db/client";
import { auditLog } from "../db/schema/audit";
import type { AuditLogRow } from "../db/schema/audit";

export interface AuditQuery {
  organizationId?: string;
  from?: Date;
  to?: Date;
  actor?: string;
  action?: string;
  resourceType?: string;
  page: number;
  perPage: number;
}

export interface AuditLogResponse {
  id: string;
  organizationId: string | null;
  actor: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  timestamp: string;
}

function toResponse(row: AuditLogRow): AuditLogResponse {
  return {
    id: row.id,
    organizationId: row.organizationId ?? null,
    actor: row.actor,
    action: row.action,
    resourceType: row.resourceType ?? null,
    resourceId: row.resourceId ?? null,
    details: (row.details as Record<string, unknown>) ?? null,
    ipAddress: row.ipAddress ?? null,
    timestamp: row.timestamp.toISOString(),
  };
}

export async function listAuditLogs(query: AuditQuery): Promise<{
  data: AuditLogResponse[];
  total: number;
  page: number;
  perPage: number;
}> {
  const { page, perPage, organizationId, from, to, actor, action, resourceType } = query;
  const offset = (page - 1) * perPage;

  const conditions = [];

  if (organizationId) conditions.push(eq(auditLog.organizationId, organizationId));
  if (from)           conditions.push(gte(auditLog.timestamp, from));
  if (to)             conditions.push(lte(auditLog.timestamp, to));
  if (actor)          conditions.push(eq(auditLog.actor, actor));
  if (action)         conditions.push(eq(auditLog.action, action as AuditLogRow["action"]));
  if (resourceType)   conditions.push(eq(auditLog.resourceType, resourceType));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.timestamp))
      .limit(perPage)
      .offset(offset),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);

  return {
    data: rows.map(toResponse),
    total: Number(total),
    page,
    perPage,
  };
}

// ---------------------------------------------------------------------------
// Stats for the PDF report
// ---------------------------------------------------------------------------

export interface AuditStats {
  total: number;
  uniqueActors: number;
  byAction: Record<string, number>;
  byActor: Record<string, number>;
  byResourceType: Record<string, number>;
  perDay: Array<{ date: string; count: number }>;
  criticalActions: AuditLogResponse[];
}

export async function getAuditStats(
  organizationId: string,
  from: Date,
  to: Date
): Promise<AuditStats> {
  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        gte(auditLog.timestamp, from),
        lte(auditLog.timestamp, to)
      )
    )
    .orderBy(desc(auditLog.timestamp));

  const byAction: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  const byResourceType: Record<string, number> = {};
  const perDayMap: Record<string, number> = {};
  const actors = new Set<string>();
  const critical: AuditLogResponse[] = [];

  for (const row of rows) {
    byAction[row.action] = (byAction[row.action] ?? 0) + 1;
    byActor[row.actor] = (byActor[row.actor] ?? 0) + 1;
    actors.add(row.actor);

    if (row.resourceType) {
      byResourceType[row.resourceType] = (byResourceType[row.resourceType] ?? 0) + 1;
    }

    const dateKey = row.timestamp.toISOString().slice(0, 10);
    perDayMap[dateKey] = (perDayMap[dateKey] ?? 0) + 1;

    // Critical = DELETE, STATUS_CHANGE, INCIDENT_CREATED, MAPPING_CHANGED
    const isCritical = [
      "DELETE", "STATUS_CHANGE", "INCIDENT_CREATED", "MAPPING_CHANGED",
    ].includes(row.action);
    if (isCritical) {
      critical.push(toResponse(row));
    }
  }

  // Build perDay array sorted ascending
  const perDay = Object.entries(perDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return {
    total: rows.length,
    uniqueActors: actors.size,
    byAction,
    byActor,
    byResourceType,
    perDay,
    criticalActions: critical.slice(0, 50),
  };
}
