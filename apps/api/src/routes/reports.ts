import { Hono } from "hono";
import {
  generateCompliancePdf,
  generateIncidentSummaryPdf,
  getIncidentSummaryStats,
  generateThreatBriefingPdf,
} from "../services/report.service";

export const reportRoutes = new Hono();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /api/v1/reports/compliance/pdf?organizationId=xxx
//
// Returns a downloadable PDF compliance report for the given organization.
// ---------------------------------------------------------------------------
reportRoutes.get("/reports/compliance/pdf", async (c) => {
  const organizationId = c.req.query("organizationId");

  if (!organizationId) {
    return c.json(
      { error: "organizationId query parameter is required" },
      400
    );
  }

  if (!UUID_RE.test(organizationId)) {
    return c.json({ error: "organizationId must be a valid UUID" }, 400);
  }

  const buffer = await generateCompliancePdf(organizationId);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `spaceguard-compliance-${dateStr}.pdf`;

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.byteLength.toString(),
      "Cache-Control": "no-store",
    },
  });
});

// ---------------------------------------------------------------------------
// Helper: parse and validate date range params
// ---------------------------------------------------------------------------

function parseDateRange(
  fromStr: string | undefined,
  toStr: string | undefined
): { from: Date; to: Date } | { error: string } {
  // Default: last 90 days
  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr
    ? new Date(fromStr)
    : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

  if (isNaN(from.getTime())) return { error: "Invalid 'from' date. Use YYYY-MM-DD." };
  if (isNaN(to.getTime()))   return { error: "Invalid 'to' date. Use YYYY-MM-DD." };
  if (from > to)             return { error: "'from' must be before 'to'." };

  // Set 'to' to end-of-day so the full day is included
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

// ---------------------------------------------------------------------------
// GET /api/v1/reports/incident-summary/stats
//    ?organizationId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Lightweight JSON preview for the frontend report card.
// ---------------------------------------------------------------------------
reportRoutes.get("/reports/incident-summary/stats", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId is required" }, 400);
  if (!UUID_RE.test(organizationId)) return c.json({ error: "organizationId must be a valid UUID" }, 400);

  const range = parseDateRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);

  const stats = await getIncidentSummaryStats(organizationId, range.from, range.to);
  return c.json(stats);
});

// ---------------------------------------------------------------------------
// GET /api/v1/reports/incident-summary/pdf
//    ?organizationId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns a downloadable PDF incident summary report.
// ---------------------------------------------------------------------------
reportRoutes.get("/reports/incident-summary/pdf", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId is required" }, 400);
  if (!UUID_RE.test(organizationId)) return c.json({ error: "organizationId must be a valid UUID" }, 400);

  const range = parseDateRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);

  const buffer = await generateIncidentSummaryPdf(organizationId, range.from, range.to);

  const fromStr = range.from.toISOString().slice(0, 10);
  const toStr = range.to.toISOString().slice(0, 10);
  const filename = `spaceguard-incidents-${fromStr}-to-${toStr}.pdf`;

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.byteLength.toString(),
      "Cache-Control": "no-store",
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/reports/threat-briefing/pdf?organizationId=xxx
//
// Returns a downloadable PDF Threat Landscape Briefing for the given org.
// ---------------------------------------------------------------------------
reportRoutes.get("/reports/threat-briefing/pdf", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId is required" }, 400);
  if (!UUID_RE.test(organizationId)) return c.json({ error: "organizationId must be a valid UUID" }, 400);

  const buffer = await generateThreatBriefingPdf(organizationId);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `spaceguard-threat-briefing-${dateStr}.pdf`;

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.byteLength.toString(),
      "Cache-Control": "no-store",
    },
  });
});
