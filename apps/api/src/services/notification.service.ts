/**
 * Email notification service.
 *
 * Uses Resend (resend.com) for delivery when RESEND_API_KEY is set.
 * Falls back to console logging in development when no key is configured.
 */

import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema/users";
import { organizations } from "../db/schema/organizations";
import { alerts as alertsTable } from "../db/schema/alerts";
import { incidents as incidentsTable } from "../db/schema/incidents";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL = process.env.NOTIFICATION_FROM ?? "SpaceGuard <notifications@spaceguard.eu>";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const IS_LIVE = RESEND_API_KEY.length > 0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
}

interface AlertInfo {
  id: string;
  title: string;
  severity: string;
  organizationId: string;
  affectedAssetId?: string | null;
  affectedAssetName?: string | null;
  spartaTactics?: string[];
  spartaTechniques?: string[];
  triggeredAt: Date | string;
}

interface IncidentInfo {
  id: string;
  title: string;
  severity: string;
  organizationId: string;
  affectedAssetIds?: string[];
  detectedAt?: Date | string | null;
}

interface DeadlineInfo {
  incident: IncidentInfo;
  reportType: string;
  hoursRemaining: number;
}

// ---------------------------------------------------------------------------
// Shared email styles (inline CSS for email compatibility)
// ---------------------------------------------------------------------------

const COLORS = {
  bg: "#020617",
  card: "#0f172a",
  border: "#1e293b",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  blue: "#3b82f6",
  red: "#ef4444",
  amber: "#f59e0b",
  emerald: "#10b981",
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#94a3b8",
};

function severityColor(severity: string): string {
  switch (severity.toUpperCase()) {
    case "CRITICAL": return COLORS.critical;
    case "HIGH": return COLORS.high;
    case "MEDIUM": return COLORS.medium;
    default: return COLORS.low;
  }
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.bg};">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <!-- Header -->
        <tr><td style="padding:16px 24px;border-bottom:1px solid ${COLORS.border};">
          <span style="font-size:14px;font-weight:700;color:${COLORS.blue};letter-spacing:1px;">SPACEGUARD</span>
        </td></tr>
        <!-- Content -->
        <tr><td style="padding:24px;background-color:${COLORS.card};border-radius:0 0 8px 8px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 24px;text-align:center;">
          <span style="font-size:11px;color:${COLORS.textMuted};">
            SpaceGuard Cybersecurity Platform &middot; You received this because of your notification preferences.
          </span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function badge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background-color:${color}20;color:${color};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${text}</span>`;
}

function button(text: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;">
    <tr><td style="border-radius:6px;background-color:${COLORS.blue};">
      <a href="${href}" target="_blank" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">
        ${text}
      </a>
    </td></tr>
  </table>`;
}

function statBox(label: string, value: string | number, color: string = COLORS.blue): string {
  return `<td style="padding:8px 12px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:${color};">${value}</div>
    <div style="font-size:11px;color:${COLORS.textMuted};margin-top:2px;">${label}</div>
  </td>`;
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function alertNotificationHtml(alert: AlertInfo): string {
  const sColor = severityColor(alert.severity);
  const techniques = (alert.spartaTechniques ?? []).join(", ") || "N/A";
  const asset = alert.affectedAssetName ?? alert.affectedAssetId ?? "Unknown";

  return emailWrapper(`
    <div style="margin-bottom:16px;">
      ${badge(alert.severity, sColor)}
      <span style="font-size:11px;color:${COLORS.textMuted};margin-left:8px;">Alert Triggered</span>
    </div>
    <h2 style="margin:0 0 12px;font-size:18px;color:${COLORS.text};">${escapeHtml(alert.title)}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.textMuted};width:120px;">Affected Asset</td>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.text};">${escapeHtml(asset)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.textMuted};">SPARTA Technique</td>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.text};">${escapeHtml(techniques)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.textMuted};">Time</td>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.text};">${formatDate(alert.triggeredAt)}</td>
      </tr>
    </table>
    ${button("View in SpaceGuard", `${APP_URL}/alerts`)}
  `);
}

function deadlineWarningHtml(info: DeadlineInfo): string {
  const urgencyColor = info.hoursRemaining <= 6 ? COLORS.red : COLORS.amber;

  return emailWrapper(`
    <div style="margin-bottom:16px;">
      ${badge("DEADLINE", urgencyColor)}
      <span style="font-size:11px;color:${COLORS.textMuted};margin-left:8px;">NIS2 Reporting Deadline</span>
    </div>
    <h2 style="margin:0 0 12px;font-size:18px;color:${COLORS.text};">Reporting Deadline Approaching</h2>
    <p style="font-size:13px;color:${COLORS.text};margin:0 0 16px;">
      The <strong>${escapeHtml(info.reportType)}</strong> report for incident
      <strong>${escapeHtml(info.incident.title)}</strong> is due in
      <span style="color:${urgencyColor};font-weight:700;">${info.hoursRemaining} hours</span>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.textMuted};width:120px;">Incident</td>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.text};">${escapeHtml(info.incident.title)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.textMuted};">Report Type</td>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.text};">${escapeHtml(info.reportType)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.textMuted};">Hours Remaining</td>
        <td style="padding:6px 0;font-size:12px;color:${urgencyColor};font-weight:600;">${info.hoursRemaining}h</td>
      </tr>
    </table>
    ${button("Generate Report", `${APP_URL}/incidents`)}
  `);
}

function incidentCreatedHtml(incident: IncidentInfo): string {
  const sColor = severityColor(incident.severity);
  const assetCount = incident.affectedAssetIds?.length ?? 0;

  return emailWrapper(`
    <div style="margin-bottom:16px;">
      ${badge(incident.severity, sColor)}
      <span style="font-size:11px;color:${COLORS.textMuted};margin-left:8px;">Incident Created</span>
    </div>
    <h2 style="margin:0 0 12px;font-size:18px;color:${COLORS.text};">${escapeHtml(incident.title)}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.textMuted};width:120px;">Severity</td>
        <td style="padding:6px 0;font-size:12px;color:${sColor};font-weight:600;">${incident.severity}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.textMuted};">Affected Assets</td>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.text};">${assetCount} asset${assetCount !== 1 ? "s" : ""}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.textMuted};">Detected</td>
        <td style="padding:6px 0;font-size:12px;color:${COLORS.text};">${incident.detectedAt ? formatDate(incident.detectedAt) : "Just now"}</td>
      </tr>
    </table>
    ${button("View Incident", `${APP_URL}/incidents`)}
  `);
}

function weeklyDigestHtml(stats: {
  orgName: string;
  newAlerts: number;
  criticalAlerts: number;
  openIncidents: number;
  closedIncidents: number;
  complianceScore: number;
  upcomingDeadlines: number;
  periodStart: string;
  periodEnd: string;
}): string {
  return emailWrapper(`
    <h2 style="margin:0 0 4px;font-size:18px;color:${COLORS.text};">Weekly Security Digest</h2>
    <p style="font-size:12px;color:${COLORS.textMuted};margin:0 0 20px;">
      ${escapeHtml(stats.orgName)} &middot; ${stats.periodStart} to ${stats.periodEnd}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background-color:${COLORS.bg};border-radius:6px;border:1px solid ${COLORS.border};">
      <tr>
        ${statBox("New Alerts", stats.newAlerts, stats.criticalAlerts > 0 ? COLORS.red : COLORS.blue)}
        ${statBox("Critical", stats.criticalAlerts, COLORS.red)}
        ${statBox("Open Incidents", stats.openIncidents, stats.openIncidents > 0 ? COLORS.amber : COLORS.emerald)}
        ${statBox("Resolved", stats.closedIncidents, COLORS.emerald)}
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background-color:${COLORS.bg};border-radius:6px;border:1px solid ${COLORS.border};margin-top:12px;">
      <tr>
        ${statBox("Compliance", `${stats.complianceScore}%`, stats.complianceScore >= 80 ? COLORS.emerald : COLORS.amber)}
        ${statBox("Upcoming Deadlines", stats.upcomingDeadlines, stats.upcomingDeadlines > 0 ? COLORS.amber : COLORS.textMuted)}
      </tr>
    </table>
    ${button("Open Dashboard", APP_URL)}
  `);
}

// ---------------------------------------------------------------------------
// Send helper (Resend API or console fallback)
// ---------------------------------------------------------------------------

async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!IS_LIVE) {
    console.log("[notification] (dev mode) Email would be sent:");
    console.log(`  To: ${payload.to.join(", ")}`);
    console.log(`  Subject: ${payload.subject}`);
    console.log(`  Body: ${payload.html.length} chars HTML`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[notification] Resend API error: ${res.status} ${body}`);
    }
  } catch (err) {
    console.error("[notification] Failed to send email:", err);
  }
}

// ---------------------------------------------------------------------------
// Recipient helpers
// ---------------------------------------------------------------------------

async function getRecipients(
  organizationId: string,
  roles: string[],
  prefColumn: "notifyCriticalAlerts" | "notifyDeadlines" | "notifyWeeklyDigest"
): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.isActive, true),
        eq(users[prefColumn], true),
        inArray(users.role, roles as ["ADMIN"])
      )
    );
  return rows.map((r) => r.email);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send alert notification to OPERATOR and ADMIN users who have
 * notify_critical_alerts enabled.
 */
export async function sendAlertNotification(alert: AlertInfo, recipients?: string[]): Promise<void> {
  const to = recipients ?? await getRecipients(alert.organizationId, ["ADMIN", "OPERATOR"], "notifyCriticalAlerts");
  if (to.length === 0) return;

  await sendEmail({
    to,
    subject: `[${alert.severity}] Alert: ${alert.title}`,
    html: alertNotificationHtml(alert),
  });
}

/**
 * Send deadline warning to ADMIN users who have notify_deadlines enabled.
 */
export async function sendDeadlineWarning(
  incident: IncidentInfo,
  reportType: string,
  hoursRemaining: number
): Promise<void> {
  const to = await getRecipients(incident.organizationId, ["ADMIN"], "notifyDeadlines");
  if (to.length === 0) return;

  await sendEmail({
    to,
    subject: `[DEADLINE] ${reportType} due in ${hoursRemaining}h: ${incident.title}`,
    html: deadlineWarningHtml({ incident, reportType, hoursRemaining }),
  });
}

/**
 * Send incident creation notification to OPERATOR users.
 */
export async function sendIncidentCreated(incident: IncidentInfo, recipients?: string[]): Promise<void> {
  const to = recipients ?? await getRecipients(incident.organizationId, ["ADMIN", "OPERATOR"], "notifyCriticalAlerts");
  if (to.length === 0) return;

  await sendEmail({
    to,
    subject: `[INCIDENT] ${incident.severity}: ${incident.title}`,
    html: incidentCreatedHtml(incident),
  });
}

/**
 * Send weekly digest to users who have notify_weekly_digest enabled.
 */
export async function sendWeeklyDigest(organizationId: string): Promise<void> {
  const to = await getRecipients(organizationId, ["ADMIN", "OPERATOR", "AUDITOR", "VIEWER"], "notifyWeeklyDigest");
  if (to.length === 0) return;

  // Fetch org name
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) return;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // New alerts this week
  const [alertStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      critical: sql<number>`count(*) filter (where severity = 'CRITICAL')::int`,
    })
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.organizationId, organizationId),
        gte(alertsTable.triggeredAt, weekAgo)
      )
    );

  // Open + closed incidents this week
  const [incidentStats] = await db
    .select({
      open: sql<number>`count(*) filter (where status not in ('CLOSED', 'FALSE_POSITIVE'))::int`,
      closed: sql<number>`count(*) filter (where status in ('CLOSED', 'FALSE_POSITIVE') and updated_at >= ${weekAgo})::int`,
    })
    .from(incidentsTable)
    .where(eq(incidentsTable.organizationId, organizationId));

  // Compliance score (simple % of COMPLIANT mappings)
  const [complianceRow] = await db.execute<{ score: number }>(sql`
    SELECT coalesce(
      round(100.0 * count(*) filter (where status = 'COMPLIANT') / nullif(count(*), 0)),
      0
    )::int as score
    FROM compliance_mappings
    WHERE organization_id = ${organizationId}
  `);

  // Upcoming deadlines (incident reports due in next 7 days)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [deadlineRow] = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int as cnt
    FROM incident_reports
    WHERE incident_id IN (
      SELECT id FROM incidents WHERE organization_id = ${organizationId}
    )
    AND status = 'DRAFT'
    AND deadline_at IS NOT NULL
    AND deadline_at <= ${nextWeek}
  `);

  const stats = {
    orgName: org.name,
    newAlerts: alertStats?.total ?? 0,
    criticalAlerts: alertStats?.critical ?? 0,
    openIncidents: incidentStats?.open ?? 0,
    closedIncidents: incidentStats?.closed ?? 0,
    complianceScore: (complianceRow as unknown as { score: number })?.score ?? 0,
    upcomingDeadlines: (deadlineRow as unknown as { cnt: number })?.cnt ?? 0,
    periodStart: formatDateShort(weekAgo),
    periodEnd: formatDateShort(now),
  };

  await sendEmail({
    to,
    subject: `[Weekly Digest] ${org.name}: ${stats.newAlerts} alerts, ${stats.openIncidents} open incidents`,
    html: weeklyDigestHtml(stats),
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function formatDateShort(d: Date): string {
  return d.toISOString().slice(0, 10);
}
