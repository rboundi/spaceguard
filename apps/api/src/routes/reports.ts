import { Hono } from "hono";
import { generateCompliancePdf } from "../services/report.service";

export const reportRoutes = new Hono();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/v1/reports/compliance/pdf?organizationId=xxx
//
// Returns a downloadable PDF compliance report for the given organization.
// Content-Disposition is set so browsers will save it as:
//   spaceguard-compliance-YYYY-MM-DD.pdf
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

  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `spaceguard-compliance-${dateStr}.pdf`;

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.byteLength.toString(),
      "Cache-Control": "no-store",
    },
  });
});
