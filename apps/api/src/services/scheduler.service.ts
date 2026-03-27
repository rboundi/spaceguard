/**
 * Scheduled Report Execution Service
 *
 * Periodically checks for due scheduled reports, generates their PDFs,
 * and emails them to the configured recipient list.
 *
 * MVP: runs as a setInterval in the API process (every 60 minutes).
 * Production: swap for a proper cron or worker process.
 */

import { eq, lte, and } from "drizzle-orm";
import { db } from "../db/client";
import { scheduledReports, type ScheduledReport } from "../db/schema/scheduled-reports";
import { organizations } from "../db/schema/organizations";
import {
  generateCompliancePdf,
  generateIncidentSummaryPdf,
  generateThreatBriefingPdf,
  generateSupplyChainPdf,
  generateAuditTrailPdf,
} from "./report.service";
import { sendEmail } from "./notification.service";

// ---------------------------------------------------------------------------
// Next-run calculation
// ---------------------------------------------------------------------------

export function calculateNextRun(
  schedule: "WEEKLY" | "MONTHLY" | "QUARTERLY",
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  from?: Date,
): Date {
  const now = from ?? new Date();
  const next = new Date(now);

  switch (schedule) {
    case "WEEKLY": {
      // Target day of week (0 = Sunday, default Monday = 1)
      const target = dayOfWeek ?? 1;
      const currentDay = next.getDay();
      let daysUntil = target - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      next.setDate(next.getDate() + daysUntil);
      next.setHours(8, 0, 0, 0); // 08:00 UTC
      return next;
    }

    case "MONTHLY": {
      // Target day of month (default 1st)
      const target = dayOfMonth ?? 1;
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(target, daysInMonth(next.getFullYear(), next.getMonth())));
      next.setHours(8, 0, 0, 0);
      return next;
    }

    case "QUARTERLY": {
      // Jump to next quarter boundary month (Jan, Apr, Jul, Oct)
      const target = dayOfMonth ?? 1;
      const currentMonth = next.getMonth();
      const nextQuarterMonth = Math.ceil((currentMonth + 1) / 3) * 3;
      const monthsToAdd = nextQuarterMonth - currentMonth;
      next.setMonth(next.getMonth() + monthsToAdd);
      next.setDate(Math.min(target, daysInMonth(next.getFullYear(), next.getMonth())));
      next.setHours(8, 0, 0, 0);
      return next;
    }

    default:
      // Fallback: 1 week from now
      next.setDate(next.getDate() + 7);
      next.setHours(8, 0, 0, 0);
      return next;
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ---------------------------------------------------------------------------
// Report generation dispatcher
// ---------------------------------------------------------------------------

async function generateReportBuffer(
  reportType: string,
  organizationId: string,
): Promise<Buffer> {
  // For date-range reports, default to last 90 days
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

  switch (reportType) {
    case "COMPLIANCE":
      return generateCompliancePdf(organizationId);
    case "INCIDENT_SUMMARY":
      return generateIncidentSummaryPdf(organizationId, from, to);
    case "THREAT_BRIEFING":
      return generateThreatBriefingPdf(organizationId);
    case "SUPPLY_CHAIN":
      return generateSupplyChainPdf(organizationId);
    case "AUDIT_TRAIL":
      return generateAuditTrailPdf(organizationId, from, to);
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

const REPORT_TYPE_SUBJECTS: Record<string, string> = {
  COMPLIANCE: "NIS2 Compliance Report",
  INCIDENT_SUMMARY: "Incident Summary Report",
  THREAT_BRIEFING: "Threat Landscape Briefing",
  SUPPLY_CHAIN: "Supply Chain Risk Assessment",
  AUDIT_TRAIL: "Audit Trail Report",
};

const REPORT_TYPE_FILENAMES: Record<string, string> = {
  COMPLIANCE: "compliance",
  INCIDENT_SUMMARY: "incident-summary",
  THREAT_BRIEFING: "threat-briefing",
  SUPPLY_CHAIN: "supply-chain",
  AUDIT_TRAIL: "audit-trail",
};

// ---------------------------------------------------------------------------
// Generate + send a single scheduled report
// ---------------------------------------------------------------------------

export async function generateAndSendReport(schedule: ScheduledReport): Promise<void> {
  const orgRows = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, schedule.organizationId))
    .limit(1);

  const orgName = orgRows[0]?.name ?? "Unknown Organization";
  const dateStr = new Date().toISOString().slice(0, 10);
  const subject = `[SpaceGuard] ${REPORT_TYPE_SUBJECTS[schedule.reportType] ?? schedule.reportType} - ${orgName} (${dateStr})`;
  const fileSlug = REPORT_TYPE_FILENAMES[schedule.reportType] ?? "report";
  const filename = `spaceguard-${fileSlug}-${dateStr}.pdf`;

  console.log(`[scheduler] Generating ${schedule.reportType} for org ${schedule.organizationId}...`);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateReportBuffer(schedule.reportType, schedule.organizationId);
  } catch (err) {
    console.error(`[scheduler] Failed to generate ${schedule.reportType}:`, err);
    return;
  }

  const pdfBase64 = pdfBuffer.toString("base64");

  // Build HTML email body
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #0f172a; border-radius: 8px; padding: 24px; color: #e2e8f0;">
        <h2 style="margin: 0 0 8px 0; color: #f8fafc; font-size: 18px;">
          ${REPORT_TYPE_SUBJECTS[schedule.reportType] ?? "Report"}
        </h2>
        <p style="margin: 0 0 16px 0; color: #94a3b8; font-size: 14px;">
          ${orgName} &middot; ${dateStr}
        </p>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.5;">
          Your scheduled ${(REPORT_TYPE_SUBJECTS[schedule.reportType] ?? "report").toLowerCase()}
          has been automatically generated and is attached to this email as a PDF.
        </p>
        <hr style="border: none; border-top: 1px solid #334155; margin: 16px 0;" />
        <p style="color: #64748b; font-size: 12px; margin: 0;">
          This is an automated email from SpaceGuard. To manage your report
          schedules, visit the Reports page in your SpaceGuard dashboard.
        </p>
      </div>
    </div>
  `.trim();

  // Note: Resend supports attachments. For the MVP we include the PDF as
  // a base64-encoded attachment. The sendEmail helper currently only sends
  // html, so we call the Resend API directly for attachments.
  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
  const FROM_EMAIL = process.env.NOTIFICATION_FROM ?? "SpaceGuard <notifications@spaceguard.eu>";

  if (RESEND_API_KEY.length > 0) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: schedule.recipients,
          subject,
          html,
          attachments: [
            {
              filename,
              content: pdfBase64,
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`[scheduler] Resend API error: ${res.status} ${body}`);
      } else {
        console.log(`[scheduler] Report email sent to ${schedule.recipients.join(", ")}`);
      }
    } catch (err) {
      console.error("[scheduler] Failed to send report email:", err);
    }
  } else {
    // Dev mode fallback
    console.log(`[scheduler] (dev mode) Would email report to: ${schedule.recipients.join(", ")}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Attachment: ${filename} (${pdfBuffer.byteLength} bytes)`);
  }
}

// ---------------------------------------------------------------------------
// Check and run all due schedules
// ---------------------------------------------------------------------------

export async function checkAndRunSchedules(): Promise<void> {
  const now = new Date();

  // Find all active schedules whose next_run is in the past
  const dueSchedules = await db
    .select()
    .from(scheduledReports)
    .where(
      and(
        eq(scheduledReports.isActive, true),
        lte(scheduledReports.nextRun, now),
      ),
    );

  if (dueSchedules.length === 0) return;

  console.log(`[scheduler] Found ${dueSchedules.length} due report(s) to process`);

  for (const schedule of dueSchedules) {
    try {
      await generateAndSendReport(schedule);

      // Update last_generated and compute next_run
      const nextRun = calculateNextRun(
        schedule.schedule,
        schedule.dayOfWeek,
        schedule.dayOfMonth,
        now,
      );

      await db
        .update(scheduledReports)
        .set({
          lastGenerated: now,
          nextRun,
          updatedAt: now,
        })
        .where(eq(scheduledReports.id, schedule.id));

      console.log(`[scheduler] Updated schedule ${schedule.id}: next run at ${nextRun.toISOString()}`);
    } catch (err) {
      console.error(`[scheduler] Error processing schedule ${schedule.id}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Start the interval timer (call once at server boot)
// ---------------------------------------------------------------------------

let intervalHandle: ReturnType<typeof setInterval> | null = null;

const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startScheduler(): void {
  if (intervalHandle) return; // already running

  console.log("[scheduler] Starting report scheduler (check interval: 60 min)");

  // Run an initial check shortly after startup (30s delay)
  setTimeout(() => {
    checkAndRunSchedules().catch((err) =>
      console.error("[scheduler] Initial check failed:", err),
    );
  }, 30_000);

  intervalHandle = setInterval(() => {
    checkAndRunSchedules().catch((err) =>
      console.error("[scheduler] Periodic check failed:", err),
    );
  }, SCHEDULER_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[scheduler] Scheduler stopped");
  }
}
