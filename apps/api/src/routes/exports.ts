/**
 * Export routes: CSV and STIX 2.1 Bundle downloads.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  exportAlertsCsv,
  exportIncidentsCsv,
  exportComplianceCsv,
  exportAuditCsv,
  exportStixBundle,
} from "../services/export.service";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const exportRoutes = new Hono();

// Shared query schema for org + date range
const orgDateSchema = z.object({
  organizationId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const orgOnlySchema = z.object({
  organizationId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET /export/alerts/csv
// ---------------------------------------------------------------------------

exportRoutes.get("/export/alerts/csv", async (c) => {
  const raw = c.req.query();
  const parsed = orgDateSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const { organizationId, from, to } = parsed.data;
  const csv = await exportAlertsCsv(organizationId, { from, to });

  logAudit({
    organizationId,
    actor: extractActor(c),
    action: "EXPORT",
    resourceType: "alerts",
    details: { format: "csv", from, to },
    ipAddress: extractIp(c),
  });

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="spaceguard-alerts-${organizationId.slice(0, 8)}.csv"`);
  return c.body(csv);
});

// ---------------------------------------------------------------------------
// GET /export/incidents/csv
// ---------------------------------------------------------------------------

exportRoutes.get("/export/incidents/csv", async (c) => {
  const raw = c.req.query();
  const parsed = orgDateSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const { organizationId, from, to } = parsed.data;
  const csv = await exportIncidentsCsv(organizationId, { from, to });

  logAudit({
    organizationId,
    actor: extractActor(c),
    action: "EXPORT",
    resourceType: "incidents",
    details: { format: "csv", from, to },
    ipAddress: extractIp(c),
  });

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="spaceguard-incidents-${organizationId.slice(0, 8)}.csv"`);
  return c.body(csv);
});

// ---------------------------------------------------------------------------
// GET /export/compliance/csv
// ---------------------------------------------------------------------------

exportRoutes.get("/export/compliance/csv", async (c) => {
  const raw = c.req.query();
  const parsed = orgOnlySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const { organizationId } = parsed.data;
  const csv = await exportComplianceCsv(organizationId);

  logAudit({
    organizationId,
    actor: extractActor(c),
    action: "EXPORT",
    resourceType: "compliance",
    details: { format: "csv" },
    ipAddress: extractIp(c),
  });

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="spaceguard-compliance-${organizationId.slice(0, 8)}.csv"`);
  return c.body(csv);
});

// ---------------------------------------------------------------------------
// GET /export/audit/csv
// ---------------------------------------------------------------------------

exportRoutes.get("/export/audit/csv", async (c) => {
  const raw = c.req.query();
  const parsed = orgDateSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const { organizationId, from, to } = parsed.data;
  const csv = await exportAuditCsv(organizationId, { from, to });

  logAudit({
    organizationId,
    actor: extractActor(c),
    action: "EXPORT",
    resourceType: "audit_log",
    details: { format: "csv", from, to },
    ipAddress: extractIp(c),
  });

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="spaceguard-audit-${organizationId.slice(0, 8)}.csv"`);
  return c.body(csv);
});

// ---------------------------------------------------------------------------
// POST /export/stix
// ---------------------------------------------------------------------------

const stixOptionsSchema = z.object({
  organizationId: z.string().uuid(),
  includeAlerts: z.boolean().default(true),
  includeIncidents: z.boolean().default(true),
  includeThreatIntel: z.boolean().default(true),
  includeRelationships: z.boolean().default(true),
  from: z.string().optional(),
  to: z.string().optional(),
});

exportRoutes.post("/export/stix", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = stixOptionsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const { organizationId, ...options } = parsed.data;
  const bundle = await exportStixBundle(organizationId, options);

  logAudit({
    organizationId,
    actor: extractActor(c),
    action: "EXPORT",
    resourceType: "stix_bundle",
    details: { format: "stix-2.1", objectCount: bundle.objects.length, ...options },
    ipAddress: extractIp(c),
  });

  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="spaceguard-stix-bundle-${organizationId.slice(0, 8)}.json"`);
  return c.json(bundle);
});
