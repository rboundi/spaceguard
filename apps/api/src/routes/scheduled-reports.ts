import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { scheduledReports } from "../db/schema/scheduled-reports";
import { assertTenant, UUID_RE } from "../middleware/validate";
import { createScheduledReportSchema, updateScheduledReportSchema } from "@spaceguard/shared";
import { calculateNextRun, generateAndSendReport } from "../services/scheduler.service";

export const scheduledReportRoutes = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRow(row: typeof scheduledReports.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    reportType: row.reportType,
    schedule: row.schedule,
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    recipients: row.recipients,
    lastGenerated: row.lastGenerated?.toISOString() ?? null,
    nextRun: row.nextRun.toISOString(),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /reports/scheduled?organizationId=xxx
// ---------------------------------------------------------------------------

scheduledReportRoutes.get("/reports/scheduled", async (c) => {
  const organizationId = c.req.query("organizationId");
  if (!organizationId) return c.json({ error: "organizationId is required" }, 400);
  if (!UUID_RE.test(organizationId)) return c.json({ error: "organizationId must be a valid UUID" }, 400);
  assertTenant(c, organizationId);

  const rows = await db
    .select()
    .from(scheduledReports)
    .where(eq(scheduledReports.organizationId, organizationId));

  return c.json({ data: rows.map(formatRow), total: rows.length });
});

// ---------------------------------------------------------------------------
// GET /reports/scheduled/:id
// ---------------------------------------------------------------------------

scheduledReportRoutes.get("/reports/scheduled/:id", async (c) => {
  const { id } = c.req.param();
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);

  const [row] = await db
    .select()
    .from(scheduledReports)
    .where(eq(scheduledReports.id, id))
    .limit(1);

  if (!row) return c.json({ error: "Scheduled report not found" }, 404);
  assertTenant(c, row.organizationId);

  return c.json(formatRow(row));
});

// ---------------------------------------------------------------------------
// POST /reports/scheduled
// ---------------------------------------------------------------------------

scheduledReportRoutes.post("/reports/scheduled", async (c) => {
  const body = await c.req.json();
  const parsed = createScheduledReportSchema.parse(body);
  assertTenant(c, parsed.organizationId);

  // Calculate the initial next run
  const nextRun = calculateNextRun(
    parsed.schedule,
    parsed.dayOfWeek ?? null,
    parsed.dayOfMonth ?? null,
  );

  const [row] = await db
    .insert(scheduledReports)
    .values({
      organizationId: parsed.organizationId,
      reportType: parsed.reportType,
      schedule: parsed.schedule,
      dayOfWeek: parsed.dayOfWeek ?? null,
      dayOfMonth: parsed.dayOfMonth ?? null,
      recipients: parsed.recipients,
      isActive: parsed.isActive ?? true,
      nextRun,
    })
    .returning();

  if (!row) return c.json({ error: "Failed to create scheduled report" }, 500);

  return c.json(formatRow(row), 201);
});

// ---------------------------------------------------------------------------
// PUT /reports/scheduled/:id
// ---------------------------------------------------------------------------

scheduledReportRoutes.put("/reports/scheduled/:id", async (c) => {
  const { id } = c.req.param();
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);

  // Pre-mutation tenant check
  const [existing] = await db
    .select({ organizationId: scheduledReports.organizationId, schedule: scheduledReports.schedule, dayOfWeek: scheduledReports.dayOfWeek, dayOfMonth: scheduledReports.dayOfMonth })
    .from(scheduledReports)
    .where(eq(scheduledReports.id, id))
    .limit(1);

  if (!existing) return c.json({ error: "Scheduled report not found" }, 404);
  assertTenant(c, existing.organizationId);

  const body = await c.req.json();
  const parsed = updateScheduledReportSchema.parse(body);

  // Recompute next_run if schedule params changed
  const effectiveSchedule = parsed.schedule ?? existing.schedule;
  const effectiveDow = parsed.dayOfWeek !== undefined ? parsed.dayOfWeek : existing.dayOfWeek;
  const effectiveDom = parsed.dayOfMonth !== undefined ? parsed.dayOfMonth : existing.dayOfMonth;
  const nextRun = calculateNextRun(effectiveSchedule, effectiveDow ?? null, effectiveDom ?? null);

  const [row] = await db
    .update(scheduledReports)
    .set({
      ...parsed,
      nextRun,
      updatedAt: new Date(),
    })
    .where(eq(scheduledReports.id, id))
    .returning();

  if (!row) return c.json({ error: "Failed to update scheduled report" }, 500);

  return c.json(formatRow(row));
});

// ---------------------------------------------------------------------------
// DELETE /reports/scheduled/:id
// ---------------------------------------------------------------------------

scheduledReportRoutes.delete("/reports/scheduled/:id", async (c) => {
  const { id } = c.req.param();
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);

  // Pre-mutation tenant check
  const [existing] = await db
    .select({ organizationId: scheduledReports.organizationId })
    .from(scheduledReports)
    .where(eq(scheduledReports.id, id))
    .limit(1);

  if (!existing) return c.json({ error: "Scheduled report not found" }, 404);
  assertTenant(c, existing.organizationId);

  await db.delete(scheduledReports).where(eq(scheduledReports.id, id));

  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /reports/scheduled/:id/run-now  (manual trigger)
// ---------------------------------------------------------------------------

scheduledReportRoutes.post("/reports/scheduled/:id/run-now", async (c) => {
  const { id } = c.req.param();
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);

  const [row] = await db
    .select()
    .from(scheduledReports)
    .where(eq(scheduledReports.id, id))
    .limit(1);

  if (!row) return c.json({ error: "Scheduled report not found" }, 404);
  assertTenant(c, row.organizationId);

  // Fire-and-forget: generate and send, then update timestamps
  const now = new Date();

  try {
    await generateAndSendReport(row);

    const nextRun = calculateNextRun(row.schedule, row.dayOfWeek, row.dayOfMonth, now);
    await db
      .update(scheduledReports)
      .set({ lastGenerated: now, nextRun, updatedAt: now })
      .where(eq(scheduledReports.id, id));

    return c.json({ success: true, message: "Report generated and sent" });
  } catch (err) {
    console.error(`[scheduled-reports] run-now failed for ${id}:`, err);
    return c.json({ error: "Failed to generate report" }, 500);
  }
});
