/**
 * Incident Service
 *
 * Provides:
 *  - createIncident        - insert incident, auto-append DETECTED timeline entry
 *  - getIncident           - fetch single incident by id
 *  - listIncidents         - paginated list with filters
 *  - updateIncident        - update fields, auto-append status-change timeline entries
 *  - addAlertToIncident    - link an alert to an incident
 *  - listIncidentAlerts    - list alerts linked to an incident
 *  - addNote               - append a note to an incident
 *  - listNotes             - list notes for an incident
 *  - createIncidentFromAlert - auto-create incident when a HIGH/CRITICAL alert fires
 *  - calculateDeadlines    - NIS2 Article 23 reporting deadlines
 *  - generateNis2Report    - create a structured Article 23 report
 *  - listReports           - list reports for an incident
 */

import { eq, and, gte, lte, desc, count, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import {
  incidents,
  incidentAlerts,
  incidentNotes,
  incidentReports,
} from "../db/schema/incidents";
import { alerts } from "../db/schema/alerts";
import { organizations } from "../db/schema/organizations";
import { sendIncidentCreated } from "./notification.service";
import { spaceAssets } from "../db/schema/assets";
import type {
  Incident,
  IncidentNote,
  IncidentReport,
} from "../db/schema/incidents";
import type {
  CreateIncident,
  UpdateIncident,
  IncidentResponse,
  IncidentQuery,
  IncidentNoteResponse,
  IncidentReportResponse,
  IncidentAlertResponse,
  CreateIncidentNote,
  CreateIncidentReport,
  TimelineEntry,
  SpartaTechniqueEntry,
  Nis2ReportContent,
} from "@spaceguard/shared";
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentReportType,
  IncidentNis2Classification,
} from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// NIS2 Article 23 deadlines (ms offsets from createdAt)
// ---------------------------------------------------------------------------

const NIS2_DEADLINES_MS: Record<IncidentReportType, number> = {
  [IncidentReportType.EARLY_WARNING]: 24 * 60 * 60 * 1000,            // 24 h
  [IncidentReportType.INCIDENT_NOTIFICATION]: 72 * 60 * 60 * 1000,    // 72 h
  [IncidentReportType.INTERMEDIATE_REPORT]: 7 * 24 * 60 * 60 * 1000,  // 7 days
  [IncidentReportType.FINAL_REPORT]: 30 * 24 * 60 * 60 * 1000,        // 30 days
};

// ---------------------------------------------------------------------------
// Response mappers
// ---------------------------------------------------------------------------

function incidentToResponse(row: Incident): IncidentResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description,
    severity: row.severity as IncidentResponse["severity"],
    status: row.status as IncidentResponse["status"],
    nis2Classification: row.nis2Classification as IncidentResponse["nis2Classification"],
    spartaTechniques: (row.spartaTechniques as SpartaTechniqueEntry[]) ?? [],
    affectedAssetIds: (row.affectedAssetIds as string[]) ?? [],
    timeline: (row.timeline as TimelineEntry[]) ?? [],
    detectedAt: row.detectedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    timeToDetectMinutes: row.timeToDetectMinutes ?? null,
    timeToRespondMinutes: row.timeToRespondMinutes ?? null,
    correlationRule: row.correlationRule ?? null,
    correlationScore: row.correlationScore ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function noteToResponse(row: IncidentNote): IncidentNoteResponse {
  return {
    id: row.id,
    incidentId: row.incidentId,
    author: row.author,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

function reportToResponse(row: IncidentReport): IncidentReportResponse {
  return {
    id: row.id,
    incidentId: row.incidentId,
    reportType: row.reportType as IncidentReportResponse["reportType"],
    content: row.content as Nis2ReportContent,
    submittedTo: row.submittedTo ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    deadline: row.deadline?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Timeline helpers
// ---------------------------------------------------------------------------

function buildTimelineEntry(event: string, actor?: string): TimelineEntry {
  return {
    timestamp: new Date().toISOString(),
    event,
    actor,
  };
}

async function appendTimeline(
  incidentId: string,
  entry: TimelineEntry
): Promise<void> {
  // Atomic single-statement append: no SELECT + UPDATE race condition
  await db
    .update(incidents)
    .set({
      timeline: sql`${incidents.timeline} || ${JSON.stringify([entry])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(incidents.id, incidentId));
}

// ---------------------------------------------------------------------------
// Public API: Incidents
// ---------------------------------------------------------------------------

export async function createIncident(
  data: CreateIncident
): Promise<IncidentResponse> {
  const detectedAt = data.detectedAt ? new Date(data.detectedAt) : new Date();

  const initialTimeline: TimelineEntry[] = [
    {
      timestamp: detectedAt.toISOString(),
      event: "Incident detected and created",
      actor: "system",
    },
  ];

  const [row] = await db
    .insert(incidents)
    .values({
      organizationId: data.organizationId,
      title: data.title,
      description: data.description,
      severity: data.severity as Incident["severity"],
      status: "DETECTED",
      nis2Classification:
        (data.nis2Classification as Incident["nis2Classification"]) ??
        "NON_SIGNIFICANT",
      spartaTechniques: data.spartaTechniques ?? [],
      affectedAssetIds: data.affectedAssetIds ?? [],
      timeline: initialTimeline,
      detectedAt,
    })
    .returning();

  return incidentToResponse(row);
}

export async function getIncident(id: string): Promise<IncidentResponse> {
  const [row] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, id))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: `Incident ${id} not found` });
  }

  return incidentToResponse(row);
}

export async function listIncidents(
  query: IncidentQuery
): Promise<{ data: IncidentResponse[]; total: number }> {
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 20;
  const offset = (page - 1) * perPage;

  const conditions = [eq(incidents.organizationId, query.organizationId)];

  if (query.status) {
    conditions.push(eq(incidents.status, query.status as Incident["status"]));
  }
  if (query.severity) {
    conditions.push(
      eq(incidents.severity, query.severity as Incident["severity"])
    );
  }
  if (query.nis2Classification) {
    conditions.push(
      eq(
        incidents.nis2Classification,
        query.nis2Classification as Incident["nis2Classification"]
      )
    );
  }
  if (query.from) {
    conditions.push(gte(incidents.createdAt, new Date(query.from)));
  }
  if (query.to) {
    conditions.push(lte(incidents.createdAt, new Date(query.to)));
  }

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(incidents)
      .where(where)
      .orderBy(desc(incidents.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ total: count() }).from(incidents).where(where),
  ]);

  return { data: rows.map(incidentToResponse), total: Number(total) };
}

export async function updateIncident(
  id: string,
  data: UpdateIncident
): Promise<IncidentResponse> {
  // Fetch current to detect status changes for timeline
  const current = await getIncident(id);

  const resolvedStatuses: IncidentStatus[] = [
    IncidentStatus.CLOSED,
    IncidentStatus.FALSE_POSITIVE,
  ];

  const isResolving =
    data.status &&
    resolvedStatuses.includes(data.status as IncidentStatus) &&
    !resolvedStatuses.includes(current.status as IncidentStatus);

  const resolvedAt =
    isResolving
      ? (data.resolvedAt ? new Date(data.resolvedAt) : new Date())
      : undefined;

  // Calculate time-to-respond when closing
  let timeToRespondMinutes: number | undefined;
  if (isResolving && current.detectedAt) {
    const detectedMs = new Date(current.detectedAt).getTime();
    const resolvedMs = resolvedAt!.getTime();
    timeToRespondMinutes = Math.round((resolvedMs - detectedMs) / 60_000);
  }

  const [row] = await db
    .update(incidents)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.severity !== undefined && {
        severity: data.severity as Incident["severity"],
      }),
      ...(data.status !== undefined && {
        status: data.status as Incident["status"],
      }),
      ...(data.nis2Classification !== undefined && {
        nis2Classification:
          data.nis2Classification as Incident["nis2Classification"],
      }),
      ...(data.spartaTechniques !== undefined && {
        spartaTechniques: data.spartaTechniques,
      }),
      ...(data.affectedAssetIds !== undefined && {
        affectedAssetIds: data.affectedAssetIds,
      }),
      ...(resolvedAt && { resolvedAt }),
      ...(data.timeToDetectMinutes !== undefined && {
        timeToDetectMinutes: data.timeToDetectMinutes,
      }),
      ...(timeToRespondMinutes !== undefined && { timeToRespondMinutes }),
      updatedAt: new Date(),
    })
    .where(eq(incidents.id, id))
    .returning();

  // Append status-change timeline entry
  if (data.status && data.status !== current.status) {
    await appendTimeline(
      id,
      buildTimelineEntry(`Status changed to ${data.status}`, "user")
    );
  }

  return incidentToResponse(row);
}

// ---------------------------------------------------------------------------
// Public API: Alert links
// ---------------------------------------------------------------------------

export async function addAlertToIncident(
  incidentId: string,
  alertId: string
): Promise<IncidentAlertResponse> {
  // Verify both exist
  await getIncident(incidentId);

  const [alertRow] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);

  if (!alertRow) {
    throw new HTTPException(404, { message: `Alert ${alertId} not found` });
  }

  const [row] = await db
    .insert(incidentAlerts)
    .values({ incidentId, alertId })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    // Already linked - return the existing link
    const [existing] = await db
      .select()
      .from(incidentAlerts)
      .where(
        and(
          eq(incidentAlerts.incidentId, incidentId),
          eq(incidentAlerts.alertId, alertId)
        )
      )
      .limit(1);
    if (!existing) {
      throw new HTTPException(500, {
        message: `Failed to create or find link between incident ${incidentId} and alert ${alertId}`,
      });
    }
    return {
      id: existing.id,
      incidentId: existing.incidentId,
      alertId: existing.alertId,
      createdAt: existing.createdAt.toISOString(),
    };
  }

  await appendTimeline(
    incidentId,
    buildTimelineEntry(`Alert ${alertId} linked to incident`, "system")
  );

  return {
    id: row.id,
    incidentId: row.incidentId,
    alertId: row.alertId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listIncidentAlerts(
  incidentId: string
): Promise<IncidentAlertResponse[]> {
  await getIncident(incidentId);

  const rows = await db
    .select()
    .from(incidentAlerts)
    .where(eq(incidentAlerts.incidentId, incidentId))
    .orderBy(desc(incidentAlerts.createdAt));

  return rows.map((r) => ({
    id: r.id,
    incidentId: r.incidentId,
    alertId: r.alertId,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Public API: Notes
// ---------------------------------------------------------------------------

export async function addNote(
  incidentId: string,
  data: CreateIncidentNote
): Promise<IncidentNoteResponse> {
  await getIncident(incidentId);

  const [row] = await db
    .insert(incidentNotes)
    .values({ incidentId, author: data.author, content: data.content })
    .returning();

  await appendTimeline(
    incidentId,
    buildTimelineEntry(`Note added by ${data.author}`, data.author)
  );

  return noteToResponse(row);
}

export async function listNotes(
  incidentId: string
): Promise<IncidentNoteResponse[]> {
  await getIncident(incidentId);

  const rows = await db
    .select()
    .from(incidentNotes)
    .where(eq(incidentNotes.incidentId, incidentId))
    .orderBy(desc(incidentNotes.createdAt));

  return rows.map(noteToResponse);
}

// ---------------------------------------------------------------------------
// Auto-create incident from an alert
// ---------------------------------------------------------------------------

/**
 * Creates an incident automatically when a HIGH or CRITICAL alert fires.
 * The incident inherits severity, SPARTA mappings, and linked assets from
 * the alert. Called by the alert creation flow in alert.service.ts.
 */
export async function createIncidentFromAlert(
  alertId: string,
  organizationId: string
): Promise<IncidentResponse | null> {
  const [alertRow] = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);

  if (!alertRow) return null;

  // Only auto-create for HIGH or CRITICAL alerts
  if (
    alertRow.severity !== "HIGH" &&
    alertRow.severity !== "CRITICAL"
  ) {
    return null;
  }

  const spartaTechniques: SpartaTechniqueEntry[] =
    alertRow.spartaTactic && alertRow.spartaTechnique
      ? [
          {
            tactic: alertRow.spartaTactic,
            technique: alertRow.spartaTechnique,
          },
        ]
      : [];

  const affectedAssetIds = alertRow.affectedAssetId
    ? [alertRow.affectedAssetId]
    : [];

  const incident = await createIncident({
    organizationId,
    title: `[AUTO] ${alertRow.title}`,
    description: `Incident auto-created from alert ${alertRow.ruleId}: ${alertRow.description}`,
    severity:
      alertRow.severity === "CRITICAL"
        ? IncidentSeverity.CRITICAL
        : IncidentSeverity.HIGH,
    nis2Classification: IncidentNis2Classification.NON_SIGNIFICANT,
    spartaTechniques,
    affectedAssetIds,
    detectedAt: alertRow.triggeredAt.toISOString(),
  });

  // Link the triggering alert
  await addAlertToIncident(incident.id, alertId);

  // Email notification for auto-created incident (fire-and-forget)
  sendIncidentCreated({
    id: incident.id,
    title: incident.title,
    severity: incident.severity,
    organizationId,
    affectedAssetIds: incident.affectedAssetIds as string[],
    detectedAt: incident.detectedAt,
  }).catch((err: unknown) => {
    console.error("[incident-service] Failed to send incident notification:", err);
  });

  return incident;
}

// ---------------------------------------------------------------------------
// NIS2 Article 23 deadlines
// ---------------------------------------------------------------------------

export function calculateDeadlines(
  createdAt: Date
): Record<IncidentReportType, Date> {
  return {
    [IncidentReportType.EARLY_WARNING]: new Date(
      createdAt.getTime() + NIS2_DEADLINES_MS[IncidentReportType.EARLY_WARNING]
    ),
    [IncidentReportType.INCIDENT_NOTIFICATION]: new Date(
      createdAt.getTime() +
        NIS2_DEADLINES_MS[IncidentReportType.INCIDENT_NOTIFICATION]
    ),
    [IncidentReportType.INTERMEDIATE_REPORT]: new Date(
      createdAt.getTime() +
        NIS2_DEADLINES_MS[IncidentReportType.INTERMEDIATE_REPORT]
    ),
    [IncidentReportType.FINAL_REPORT]: new Date(
      createdAt.getTime() + NIS2_DEADLINES_MS[IncidentReportType.FINAL_REPORT]
    ),
  };
}

// ---------------------------------------------------------------------------
// NIS2 Article 23 report generation
// ---------------------------------------------------------------------------

/**
 * Generates a structured NIS2 Article 23 report for the given incident.
 * Populates all required fields from incident data; the operator can then
 * review and submit to the national authority.
 */
export async function generateNis2Report(
  incidentId: string,
  data: CreateIncidentReport
): Promise<IncidentReportResponse> {
  // Load incident
  const [incidentRow] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);

  if (!incidentRow) {
    throw new HTTPException(404, {
      message: `Incident ${incidentId} not found`,
    });
  }

  // Load organization name
  const [orgRow] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, incidentRow.organizationId))
    .limit(1);

  const orgName = orgRow?.name ?? incidentRow.organizationId;

  // Load affected asset names
  const assetIds = (incidentRow.affectedAssetIds as string[]) ?? [];
  let affectedAssetNames: string[] = assetIds;
  if (assetIds.length > 0) {
    const assetRows = await db
      .select({ id: spaceAssets.id, name: spaceAssets.name })
      .from(spaceAssets)
      .where(inArray(spaceAssets.id, assetIds));
    affectedAssetNames = assetRows.map((a) => `${a.name} (${a.id})`);
  }

  const now = new Date();
  const deadlines = calculateDeadlines(incidentRow.createdAt);

  const spartaTechniques =
    (incidentRow.spartaTechniques as SpartaTechniqueEntry[]) ?? [];

  const content: Nis2ReportContent = {
    incidentTitle: incidentRow.title,
    incidentId: incidentRow.id,
    reportingOrganization: orgName,
    reportingDate: now.toISOString(),
    reportType: data.reportType as IncidentReportType,

    nis2Classification:
      (incidentRow.nis2Classification as IncidentNis2Classification) ??
      IncidentNis2Classification.NON_SIGNIFICANT,
    sector: "space",
    affectedCountries: [],

    incidentDescription: incidentRow.description,
    rootCause: undefined,
    attackVector: undefined,
    spartaTechniques,

    affectedServices: [],
    affectedAssets: affectedAssetNames,
    estimatedUsersAffected: undefined,
    dataBreachOccurred: false,
    dataCategories: [],
    financialImpactEur: undefined,
    operationalImpact: undefined,

    detectedAt: incidentRow.detectedAt?.toISOString(),
    containedAt: undefined,
    resolvedAt: incidentRow.resolvedAt?.toISOString(),

    immediateActions: undefined,
    containmentMeasures: undefined,
    remediationMeasures: undefined,
    preventiveMeasures: undefined,

    crossBorderImpact: false,
    notifiedAuthorities: data.submittedTo ? [data.submittedTo] : [],
    notifiedAt: undefined,

    lessonsLearned: undefined,
    recommendedActions: undefined,
  };

  // Upsert: if a report for this (incidentId, reportType) already exists,
  // overwrite content/deadline so regenerating is idempotent.
  const [existing] = await db
    .select({ id: incidentReports.id })
    .from(incidentReports)
    .where(
      and(
        eq(incidentReports.incidentId, incidentId),
        eq(
          incidentReports.reportType,
          data.reportType as IncidentReport["reportType"]
        )
      )
    )
    .limit(1);

  let row: IncidentReport;
  if (existing) {
    [row] = await db
      .update(incidentReports)
      .set({
        content,
        submittedTo: data.submittedTo ?? null,
        deadline: deadlines[data.reportType as IncidentReportType],
        // preserve submittedAt if already submitted
      })
      .where(eq(incidentReports.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(incidentReports)
      .values({
        incidentId,
        reportType: data.reportType as IncidentReport["reportType"],
        content,
        submittedTo: data.submittedTo ?? null,
        deadline: deadlines[data.reportType as IncidentReportType],
      })
      .returning();
  }

  await appendTimeline(
    incidentId,
    buildTimelineEntry(
      `NIS2 ${data.reportType} report generated`,
      "system"
    )
  );

  return reportToResponse(row);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES: Array<Incident["status"]> = [
  "DETECTED",
  "TRIAGING",
  "INVESTIGATING",
  "CONTAINING",
  "ERADICATING",
  "RECOVERING",
];

/**
 * Returns the count of open (non-closed) incidents for an organization.
 * Used by the frontend sidebar badge to avoid 6 parallel queries.
 */
export async function getActiveIncidentCount(
  organizationId: string
): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, organizationId),
        inArray(incidents.status, ACTIVE_STATUSES)
      )
    );
  return Number(total);
}

export async function listReports(
  incidentId: string
): Promise<IncidentReportResponse[]> {
  await getIncident(incidentId);

  const rows = await db
    .select()
    .from(incidentReports)
    .where(eq(incidentReports.incidentId, incidentId))
    .orderBy(desc(incidentReports.createdAt));

  return rows.map(reportToResponse);
}

/**
 * Mark a report as submitted to a regulatory authority.
 */
export async function markReportSubmitted(
  reportId: string,
  submittedTo: string
): Promise<IncidentReportResponse> {
  const [existing] = await db
    .select()
    .from(incidentReports)
    .where(eq(incidentReports.id, reportId))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, {
      message: `Report ${reportId} not found`,
    });
  }

  const [row] = await db
    .update(incidentReports)
    .set({ submittedTo, submittedAt: new Date() })
    .where(eq(incidentReports.id, reportId))
    .returning();

  await appendTimeline(
    existing.incidentId,
    buildTimelineEntry(
      `Report ${existing.reportType} submitted to ${submittedTo}`,
      "user"
    )
  );

  return reportToResponse(row);
}
