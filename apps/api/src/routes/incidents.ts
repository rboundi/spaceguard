/**
 * Incident routes - Module 4: Incident Management
 *
 * Incidents
 *   POST   /incidents                           - create incident
 *   GET    /incidents                           - paginated list with filters
 *   GET    /incidents/:id                       - single incident
 *   PUT    /incidents/:id                       - update incident
 *
 * Incident <-> Alert links
 *   POST   /incidents/:id/alerts                - link an alert to an incident
 *   GET    /incidents/:id/alerts                - list linked alerts
 *
 * Notes
 *   POST   /incidents/:id/notes                 - add a note
 *   GET    /incidents/:id/notes                 - list notes
 *
 * NIS2 Reports
 *   POST   /incidents/:id/reports               - generate a NIS2 Article 23 report
 *   GET    /incidents/:id/reports               - list reports
 *   PUT    /incidents/:id/reports/:reportId/submit - mark report as submitted
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createIncidentSchema,
  updateIncidentSchema,
  incidentQuerySchema,
  addAlertToIncidentSchema,
  createIncidentNoteSchema,
  createIncidentReportSchema,
} from "@spaceguard/shared";
import {
  createIncident,
  getIncident,
  listIncidents,
  updateIncident,
  addAlertToIncident,
  listIncidentAlerts,
  addNote,
  listNotes,
  generateNis2Report,
  listReports,
  markReportSubmitted,
  getActiveIncidentCount,
} from "../services/incident.service";
import { logAudit, extractActor, extractIp } from "../middleware/audit";

export const incidentRoutes = new Hono();

const uuidParam = z.object({ id: z.string().uuid() });
const reportUuidParams = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Incidents CRUD
// ---------------------------------------------------------------------------

// GET /incidents/stats?organizationId=
incidentRoutes.get(
  "/incidents/stats",
  zValidator("query", z.object({ organizationId: z.string().uuid() })),
  async (c) => {
    const { organizationId } = c.req.valid("query");
    const activeCount = await getActiveIncidentCount(organizationId);
    return c.json({ activeCount });
  }
);

// POST /incidents
incidentRoutes.post(
  "/incidents",
  zValidator("json", createIncidentSchema),
  async (c) => {
    const body = c.req.valid("json");
    const incident = await createIncident(body);
    logAudit({
      organizationId: incident.organizationId,
      actor: extractActor(c),
      action: "INCIDENT_CREATED",
      resourceType: "incident",
      resourceId: incident.id,
      details: { title: incident.title, severity: incident.severity },
      ipAddress: extractIp(c),
    });
    return c.json(incident, 201);
  }
);

// GET /incidents
incidentRoutes.get(
  "/incidents",
  zValidator("query", incidentQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const result = await listIncidents(query);
    return c.json(result);
  }
);

// GET /incidents/:id
incidentRoutes.get(
  "/incidents/:id",
  zValidator("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const incident = await getIncident(id);
    return c.json(incident);
  }
);

// PUT /incidents/:id
incidentRoutes.put(
  "/incidents/:id",
  zValidator("param", uuidParam),
  zValidator("json", updateIncidentSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const incident = await updateIncident(id, body);
    const isStatusChange = "status" in body;
    logAudit({
      organizationId: incident.organizationId,
      actor: extractActor(c),
      action: isStatusChange ? "STATUS_CHANGE" : "UPDATE",
      resourceType: "incident",
      resourceId: id,
      details: isStatusChange
        ? { newStatus: body.status, title: incident.title }
        : { changes: body },
      ipAddress: extractIp(c),
    });
    return c.json(incident);
  }
);

// ---------------------------------------------------------------------------
// Incident <-> Alert links
// ---------------------------------------------------------------------------

// POST /incidents/:id/alerts
incidentRoutes.post(
  "/incidents/:id/alerts",
  zValidator("param", uuidParam),
  zValidator("json", addAlertToIncidentSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { alertId } = c.req.valid("json");
    const link = await addAlertToIncident(id, alertId);
    return c.json(link, 201);
  }
);

// GET /incidents/:id/alerts
incidentRoutes.get(
  "/incidents/:id/alerts",
  zValidator("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const links = await listIncidentAlerts(id);
    return c.json({ data: links });
  }
);

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

// POST /incidents/:id/notes
incidentRoutes.post(
  "/incidents/:id/notes",
  zValidator("param", uuidParam),
  zValidator("json", createIncidentNoteSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const note = await addNote(id, body);
    return c.json(note, 201);
  }
);

// GET /incidents/:id/notes
incidentRoutes.get(
  "/incidents/:id/notes",
  zValidator("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const notes = await listNotes(id);
    return c.json({ data: notes });
  }
);

// ---------------------------------------------------------------------------
// NIS2 Reports
// ---------------------------------------------------------------------------

// POST /incidents/:id/reports
incidentRoutes.post(
  "/incidents/:id/reports",
  zValidator("param", uuidParam),
  zValidator("json", createIncidentReportSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const report = await generateNis2Report(id, body);
    return c.json(report, 201);
  }
);

// GET /incidents/:id/reports
incidentRoutes.get(
  "/incidents/:id/reports",
  zValidator("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const reports = await listReports(id);
    return c.json({ data: reports });
  }
);

// PUT /incidents/:id/reports/:reportId/submit
incidentRoutes.put(
  "/incidents/:id/reports/:reportId/submit",
  zValidator("param", reportUuidParams),
  zValidator(
    "json",
    z.object({ submittedTo: z.string().min(1).max(255) })
  ),
  async (c) => {
    const { reportId } = c.req.valid("param");
    const { submittedTo } = c.req.valid("json");
    const report = await markReportSubmitted(reportId, submittedTo);
    return c.json(report);
  }
);
