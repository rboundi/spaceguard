/**
 * Audit Middleware + logAudit helper
 *
 * Usage in routes:
 *   import { logAudit } from "../middleware/audit";
 *
 *   logAudit({
 *     organizationId: org.id,
 *     actor:          c.req.header("x-actor") ?? "system",
 *     action:         "CREATE",
 *     resourceType:   "organization",
 *     resourceId:     org.id,
 *     details:        { name: org.name },
 *     ipAddress:      c.req.header("x-forwarded-for"),
 *   });
 *
 * Fire-and-forget: never awaited, never throws to the caller.
 */

import type { Context, MiddlewareHandler } from "hono";
import { db } from "../db/client";
import { auditLog } from "../db/schema/audit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW"
  | "EXPORT"
  | "LOGIN"
  | "LOGOUT"
  | "STATUS_CHANGE"
  | "REPORT_GENERATED"
  | "ALERT_ACKNOWLEDGED"
  | "INCIDENT_CREATED"
  | "MAPPING_CHANGED"
  | "TEST_NOTIFICATION"
  | "KEY_REGENERATION";

export interface AuditEntry {
  organizationId?: string | null;
  actor?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

// ---------------------------------------------------------------------------
// logAudit - fire-and-forget helper called from route handlers
// ---------------------------------------------------------------------------

export function logAudit(entry: AuditEntry): void {
  // We deliberately do NOT await this - the response is already on the wire
  db.insert(auditLog)
    .values({
      organizationId: entry.organizationId ?? null,
      actor: entry.actor ?? "system",
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      details: entry.details ?? null,
      ipAddress: entry.ipAddress ?? null,
      timestamp: new Date(),
    })
    .catch((err: unknown) => {
      // Log to stderr but never surface to caller
      console.error("[audit] write failed:", err);
    });
}

// ---------------------------------------------------------------------------
// extractActor - reads X-Actor header (set by frontend), falls back "system"
// ---------------------------------------------------------------------------

export function extractActor(c: Context): string {
  return c.req.header("x-actor") ?? "system";
}

export function extractIp(c: Context): string | undefined {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    undefined
  );
}

// ---------------------------------------------------------------------------
// auditMiddleware - thin Hono middleware for routes not explicitly instrumented
// Fires after the handler returns (non-blocking). Only logs mutations.
// Routes that call logAudit() directly produce richer entries; this catches
// anything that slips through.
// ---------------------------------------------------------------------------

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Resource type inferred from URL path prefix
function inferResourceType(path: string): string {
  const segments = path.replace(/^\/api\/v1\//, "").split("/");
  return segments[0] ?? "unknown";
}

function inferAction(method: string, path: string): AuditAction | null {
  if (method === "POST")   return path.includes("/reports") ? "REPORT_GENERATED" : "CREATE";
  if (method === "DELETE") return "DELETE";
  if (method === "PUT" || method === "PATCH") return "UPDATE";
  return null;
}

export const auditMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  if (!MUTATION_METHODS.has(c.req.method)) return;

  const action = inferAction(c.req.method, c.req.path);
  if (!action) return;

  const status = c.res.status;
  if (status < 200 || status >= 300) return; // only log successful mutations

  logAudit({
    organizationId: c.req.query("organizationId") ?? c.get("user")?.organizationId ?? null,
    actor: extractActor(c),
    action,
    resourceType: inferResourceType(c.req.path),
    ipAddress: extractIp(c),
    details: { method: c.req.method, path: c.req.path, status },
  });
};
