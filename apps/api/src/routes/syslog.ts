/**
 * Syslog SIEM integration routes
 *
 * GET    /settings/syslog              - list endpoints for org
 * POST   /settings/syslog              - create endpoint
 * PUT    /settings/syslog/:id          - update endpoint
 * DELETE /settings/syslog/:id          - delete endpoint
 * POST   /settings/syslog/:id/test     - send test message
 * GET    /settings/syslog/formats      - describe CEF/LEEF/JSON formats
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  listSyslogEndpoints,
  getSyslogEndpoint,
  createSyslogEndpoint,
  updateSyslogEndpoint,
  deleteSyslogEndpoint,
  testSyslogEndpoint,
} from "../services/syslog.service";
import { assertUUID, assertTenant } from "../middleware/validate";
import { logAudit, extractActor, extractIp } from "../middleware/audit";
import { requireRole } from "../middleware/auth-guard";

export const syslogRoutes = new Hono();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createSyslogSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(514),
  protocol: z.enum(["UDP", "TCP", "TLS"]).default("UDP"),
  format: z.enum(["CEF", "LEEF", "JSON"]).default("CEF"),
  minSeverity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
  isActive: z.boolean().default(true),
});

const updateSyslogSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["UDP", "TCP", "TLS"]).optional(),
  format: z.enum(["CEF", "LEEF", "JSON"]).optional(),
  minSeverity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/v1/settings/syslog?organizationId=
syslogRoutes.get("/settings/syslog", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) {
    return c.json({ error: "organizationId query parameter is required" }, 400);
  }
  assertUUID(organizationId, "organizationId");
  assertTenant(c, organizationId);

  const endpoints = await listSyslogEndpoints(organizationId);
  return c.json({ data: endpoints, total: endpoints.length });
});

// POST /api/v1/settings/syslog
syslogRoutes.post(
  "/settings/syslog",
  requireRole("ADMIN", "OPERATOR"),
  zValidator("json", createSyslogSchema),
  async (c) => {
    const data = c.req.valid("json");
    assertTenant(c, data.organizationId);

    const endpoint = await createSyslogEndpoint(data);

    logAudit({
      organizationId: data.organizationId,
      actor: extractActor(c),
      action: "CREATE",
      resourceType: "syslog_endpoint",
      resourceId: endpoint.id,
      details: { name: data.name, host: data.host, port: data.port, protocol: data.protocol, format: data.format },
      ipAddress: extractIp(c),
    });

    return c.json(endpoint, 201);
  }
);

// PUT /api/v1/settings/syslog/:id
syslogRoutes.put(
  "/settings/syslog/:id",
  requireRole("ADMIN", "OPERATOR"),
  zValidator("json", updateSyslogSchema),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");

    // Check tenant before mutation
    const existing = await getSyslogEndpoint(id);
    assertTenant(c, existing.organizationId);

    const data = c.req.valid("json");
    const endpoint = await updateSyslogEndpoint(id, data);

    logAudit({
      organizationId: existing.organizationId,
      actor: extractActor(c),
      action: "UPDATE",
      resourceType: "syslog_endpoint",
      resourceId: id,
      details: { changes: data },
      ipAddress: extractIp(c),
    });

    return c.json(endpoint);
  }
);

// DELETE /api/v1/settings/syslog/:id
syslogRoutes.delete(
  "/settings/syslog/:id",
  requireRole("ADMIN", "OPERATOR"),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");

    // Check tenant before deletion
    const existing = await getSyslogEndpoint(id);
    assertTenant(c, existing.organizationId);

    await deleteSyslogEndpoint(id);

    logAudit({
      organizationId: existing.organizationId,
      actor: extractActor(c),
      action: "DELETE",
      resourceType: "syslog_endpoint",
      resourceId: id,
      details: { name: existing.name },
      ipAddress: extractIp(c),
    });

    return c.json({ success: true });
  }
);

// POST /api/v1/settings/syslog/:id/test
syslogRoutes.post(
  "/settings/syslog/:id/test",
  requireRole("ADMIN", "OPERATOR"),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");

    const existing = await getSyslogEndpoint(id);
    assertTenant(c, existing.organizationId);

    const result = await testSyslogEndpoint(id);
    return c.json(result);
  }
);

// GET /api/v1/settings/syslog/formats
// Documentation endpoint: returns the CEF/LEEF/JSON format specs
syslogRoutes.get("/settings/syslog/formats", async (c) => {
  return c.json({
    formats: [
      {
        id: "CEF",
        name: "Common Event Format (CEF)",
        description: "Industry-standard format supported by Splunk, ArcSight, Elastic SIEM, Microsoft Sentinel, and most modern SIEMs.",
        spec: "CEF:0|SpaceGuard|SpaceGuard|1.0|{rule_id}|{title}|{severity_num}|rt={epoch_ms} externalId={alert_id} src={asset_id} spt={stream_id} cs1Label=sparta_tactic cs1={tactic} cs2Label=sparta_technique cs2={technique} msg={description} cat=Alert",
        severityMapping: { LOW: 3, MEDIUM: 5, HIGH: 7, CRITICAL: 10 },
        example: 'CEF:0|SpaceGuard|SpaceGuard|1.0|SG-TM-001|Battery Voltage Anomaly|7|rt=1711539600000 externalId=abc-123 src=sat-001 cs1Label=sparta_tactic cs1=TA0040 cs2Label=sparta_technique cs2=T0001 msg=Battery voltage exceeded threshold cat=Alert',
      },
      {
        id: "LEEF",
        name: "Log Event Extended Format (LEEF)",
        description: "Native format for IBM QRadar. Uses tab-delimited key=value pairs.",
        spec: "LEEF:2.0|SpaceGuard|SpaceGuard|1.0|{rule_id}|\\tcat=Alert\\tsev={severity_num}\\tdevTime={epoch_ms}\\texternalId={alert_id}\\tsrc={asset_id}\\tmsg={description}",
        severityMapping: { LOW: 3, MEDIUM: 5, HIGH: 7, CRITICAL: 10 },
        example: 'LEEF:2.0|SpaceGuard|SpaceGuard|1.0|SG-TM-001|\\tcat=Alert\\tsev=7\\tdevTime=1711539600000\\texternalId=abc-123\\tsrc=sat-001\\tmsg=Battery voltage exceeded threshold',
      },
      {
        id: "JSON",
        name: "JSON (Generic)",
        description: "Structured JSON format. Compatible with any SIEM that accepts JSON over syslog (Elastic, Datadog, Sumo Logic, etc.).",
        spec: '{"source":"SpaceGuard","type":"alert","version":"1.0","timestamp":"{iso8601}","severity":"{severity}","severityNum":{num},"eventId":"{rule_id}","externalId":"{alert_id}","title":"{title}","description":"{desc}","spartaTactic":"{tactic}","spartaTechnique":"{technique}"}',
        severityMapping: { LOW: 3, MEDIUM: 5, HIGH: 7, CRITICAL: 10 },
      },
    ],
    protocols: [
      { id: "UDP", name: "UDP", defaultPort: 514, description: "Standard syslog (RFC 5426). No delivery guarantee." },
      { id: "TCP", name: "TCP", defaultPort: 514, description: "Reliable syslog (RFC 6587). Newline-framed." },
      { id: "TLS", name: "TLS", defaultPort: 6514, description: "Encrypted syslog (RFC 5425). Requires TLS-capable receiver." },
    ],
  });
});
