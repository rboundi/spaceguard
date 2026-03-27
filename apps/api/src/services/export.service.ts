/**
 * Export service: CSV and STIX 2.1 Bundle generation.
 */

import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { alerts } from "../db/schema/alerts";
import { incidents } from "../db/schema/incidents";
import { complianceMappings, complianceRequirements } from "../db/schema/compliance";
import { auditLog } from "../db/schema/audit";
import { spaceAssets } from "../db/schema/assets";
import { threatIntel } from "../db/schema/intel";
import { organizations } from "../db/schema/organizations";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((r) => r.map(escapeCsv).join(","));
  return [headerLine, ...dataLines].join("\n");
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().replace("T", " ").slice(0, 19);
}

// ---------------------------------------------------------------------------
// Alerts CSV
// ---------------------------------------------------------------------------

interface AlertFilter {
  from?: string;
  to?: string;
  severity?: string;
  status?: string;
}

export async function exportAlertsCsv(
  organizationId: string,
  filters: AlertFilter = {}
): Promise<string> {
  const conditions = [eq(alerts.organizationId, organizationId)];
  if (filters.from) conditions.push(gte(alerts.triggeredAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(alerts.triggeredAt, new Date(filters.to)));

  const rows = await db
    .select({
      id: alerts.id,
      title: alerts.title,
      severity: alerts.severity,
      status: alerts.status,
      spartaTactic: alerts.spartaTactic,
      spartaTechnique: alerts.spartaTechnique,
      affectedAssetId: alerts.affectedAssetId,
      triggeredAt: alerts.triggeredAt,
      resolvedAt: alerts.resolvedAt,
      resolvedBy: alerts.resolvedBy,
      ruleId: alerts.ruleId,
    })
    .from(alerts)
    .where(and(...conditions))
    .orderBy(desc(alerts.triggeredAt))
    .limit(10000);

  // Look up asset names
  const assetIds = [...new Set(rows.filter((r) => r.affectedAssetId).map((r) => r.affectedAssetId!))];
  const assetMap = new Map<string, string>();
  if (assetIds.length > 0) {
    const assetRows = await db
      .select({ id: spaceAssets.id, name: spaceAssets.name })
      .from(spaceAssets)
      .where(eq(spaceAssets.organizationId, organizationId));
    for (const a of assetRows) {
      assetMap.set(a.id, a.name);
    }
  }

  const headers = [
    "ID", "Title", "Severity", "Status", "Rule ID",
    "SPARTA Tactic", "SPARTA Technique", "Affected Asset",
    "Triggered At", "Resolved At", "Resolved By",
  ];

  const data = rows.map((r) => [
    r.id,
    r.title,
    r.severity,
    r.status,
    r.ruleId,
    r.spartaTactic ?? "",
    r.spartaTechnique ?? "",
    r.affectedAssetId ? (assetMap.get(r.affectedAssetId) ?? r.affectedAssetId) : "",
    fmtDate(r.triggeredAt),
    fmtDate(r.resolvedAt),
    r.resolvedBy ?? "",
  ]);

  return toCsv(headers, data);
}

// ---------------------------------------------------------------------------
// Incidents CSV
// ---------------------------------------------------------------------------

interface IncidentFilter {
  from?: string;
  to?: string;
  severity?: string;
  status?: string;
}

export async function exportIncidentsCsv(
  organizationId: string,
  filters: IncidentFilter = {}
): Promise<string> {
  const conditions = [eq(incidents.organizationId, organizationId)];
  if (filters.from) conditions.push(gte(incidents.detectedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(incidents.detectedAt, new Date(filters.to)));

  const rows = await db
    .select({
      id: incidents.id,
      title: incidents.title,
      severity: incidents.severity,
      status: incidents.status,
      nis2Classification: incidents.nis2Classification,
      affectedAssetIds: incidents.affectedAssetIds,
      spartaTechniques: incidents.spartaTechniques,
      detectedAt: incidents.detectedAt,
      resolvedAt: incidents.resolvedAt,
      timeToDetectMinutes: incidents.timeToDetectMinutes,
      timeToRespondMinutes: incidents.timeToRespondMinutes,
      createdAt: incidents.createdAt,
    })
    .from(incidents)
    .where(and(...conditions))
    .orderBy(desc(incidents.createdAt))
    .limit(10000);

  const headers = [
    "ID", "Title", "Severity", "Status", "NIS2 Classification",
    "Affected Assets", "SPARTA Techniques", "Detected At",
    "Resolved At", "TTD (min)", "TTR (min)", "Created At",
  ];

  const data = rows.map((r) => [
    r.id,
    r.title,
    r.severity,
    r.status,
    r.nis2Classification,
    Array.isArray(r.affectedAssetIds) ? (r.affectedAssetIds as string[]).length : 0,
    Array.isArray(r.spartaTechniques)
      ? (r.spartaTechniques as Array<{ tactic: string; technique: string }>)
          .map((t) => `${t.tactic}/${t.technique}`)
          .join("; ")
      : "",
    fmtDate(r.detectedAt),
    fmtDate(r.resolvedAt),
    r.timeToDetectMinutes ?? "",
    r.timeToRespondMinutes ?? "",
    fmtDate(r.createdAt),
  ]);

  return toCsv(headers, data);
}

// ---------------------------------------------------------------------------
// Compliance CSV
// ---------------------------------------------------------------------------

export async function exportComplianceCsv(organizationId: string): Promise<string> {
  const rows = await db
    .select({
      reqTitle: complianceRequirements.title,
      reqArticle: complianceRequirements.articleReference,
      reqCategory: complianceRequirements.category,
      status: complianceMappings.status,
      evidence: complianceMappings.evidenceDescription,
      responsible: complianceMappings.responsiblePerson,
      lastAssessed: complianceMappings.lastAssessed,
      notes: complianceMappings.notes,
    })
    .from(complianceMappings)
    .innerJoin(
      complianceRequirements,
      eq(complianceMappings.requirementId, complianceRequirements.id)
    )
    .where(eq(complianceMappings.organizationId, organizationId))
    .orderBy(complianceRequirements.articleReference);

  const headers = [
    "Requirement", "Article", "Category", "Status",
    "Evidence", "Responsible", "Last Assessed", "Notes",
  ];

  const data = rows.map((r) => [
    r.reqTitle,
    r.reqArticle,
    r.reqCategory,
    r.status,
    r.evidence ?? "",
    r.responsible ?? "",
    fmtDate(r.lastAssessed),
    r.notes ?? "",
  ]);

  return toCsv(headers, data);
}

// ---------------------------------------------------------------------------
// Audit CSV
// ---------------------------------------------------------------------------

interface AuditFilter {
  from?: string;
  to?: string;
}

export async function exportAuditCsv(
  organizationId: string,
  filters: AuditFilter = {}
): Promise<string> {
  const conditions = [eq(auditLog.organizationId, organizationId)];
  if (filters.from) conditions.push(gte(auditLog.timestamp, new Date(filters.from)));
  if (filters.to) conditions.push(lte(auditLog.timestamp, new Date(filters.to)));

  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.timestamp))
    .limit(10000);

  const headers = [
    "ID", "Timestamp", "Actor", "Action", "Resource Type",
    "Resource ID", "Details", "IP Address",
  ];

  const data = rows.map((r) => [
    r.id,
    fmtDate(r.timestamp),
    r.actor,
    r.action,
    r.resourceType ?? "",
    r.resourceId ?? "",
    r.details ? JSON.stringify(r.details) : "",
    r.ipAddress ?? "",
  ]);

  return toCsv(headers, data);
}

// ---------------------------------------------------------------------------
// STIX 2.1 Bundle export
// ---------------------------------------------------------------------------

interface StixOptions {
  includeAlerts?: boolean;
  includeIncidents?: boolean;
  includeThreatIntel?: boolean;
  includeRelationships?: boolean;
  from?: string;
  to?: string;
}

interface StixObject {
  type: string;
  spec_version: string;
  id: string;
  created: string;
  modified: string;
  [key: string]: unknown;
}

interface StixBundle {
  type: "bundle";
  id: string;
  objects: StixObject[];
}

function stixId(type: string, uuid: string): string {
  return `${type}--${uuid}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function exportStixBundle(
  organizationId: string,
  options: StixOptions = {}
): Promise<StixBundle> {
  const {
    includeAlerts = true,
    includeIncidents = true,
    includeThreatIntel = true,
    includeRelationships = true,
    from,
    to,
  } = options;

  const objects: StixObject[] = [];
  const now = nowIso();

  // Org identity
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (org) {
    objects.push({
      type: "identity",
      spec_version: "2.1",
      id: stixId("identity", org.id),
      created: now,
      modified: now,
      name: org.name,
      identity_class: "organization",
      sectors: ["space"],
      contact_information: org.contactEmail,
    });
  }

  // Alerts -> STIX Indicators
  if (includeAlerts) {
    const alertConditions = [eq(alerts.organizationId, organizationId)];
    if (from) alertConditions.push(gte(alerts.triggeredAt, new Date(from)));
    if (to) alertConditions.push(lte(alerts.triggeredAt, new Date(to)));

    const alertRows = await db
      .select()
      .from(alerts)
      .where(and(...alertConditions))
      .orderBy(desc(alerts.triggeredAt))
      .limit(5000);

    for (const a of alertRows) {
      const indicator: StixObject = {
        type: "indicator",
        spec_version: "2.1",
        id: stixId("indicator", a.id),
        created: a.createdAt.toISOString(),
        modified: a.updatedAt.toISOString(),
        name: a.title,
        description: a.description,
        indicator_types: ["anomalous-activity"],
        pattern: `[spaceguard:rule_id = '${a.ruleId}']`,
        pattern_type: "spaceguard",
        valid_from: a.triggeredAt.toISOString(),
        labels: [a.severity.toLowerCase()],
        created_by_ref: org ? stixId("identity", org.id) : undefined,
        extensions: {
          "extension-definition--spaceguard": {
            alert_id: a.id,
            severity: a.severity,
            status: a.status,
            sparta_tactic: a.spartaTactic,
            sparta_technique: a.spartaTechnique,
            affected_asset_id: a.affectedAssetId,
            rule_id: a.ruleId,
          },
        },
      };
      objects.push(indicator);

      // Relationship: indicator -> identity (targets)
      if (includeRelationships && org) {
        objects.push({
          type: "relationship",
          spec_version: "2.1",
          id: stixId("relationship", `${a.id}-targets-${org.id}`),
          created: now,
          modified: now,
          relationship_type: "targets",
          source_ref: stixId("indicator", a.id),
          target_ref: stixId("identity", org.id),
        });
      }
    }
  }

  // Incidents -> STIX Incidents
  if (includeIncidents) {
    const incConditions = [eq(incidents.organizationId, organizationId)];
    if (from) incConditions.push(gte(incidents.detectedAt, new Date(from)));
    if (to) incConditions.push(lte(incidents.detectedAt, new Date(to)));

    const incidentRows = await db
      .select()
      .from(incidents)
      .where(and(...incConditions))
      .orderBy(desc(incidents.createdAt))
      .limit(5000);

    for (const inc of incidentRows) {
      const stixInc: StixObject = {
        type: "incident",
        spec_version: "2.1",
        id: stixId("incident", inc.id),
        created: inc.createdAt.toISOString(),
        modified: inc.updatedAt.toISOString(),
        name: inc.title,
        description: inc.description,
        created_by_ref: org ? stixId("identity", org.id) : undefined,
        extensions: {
          "extension-definition--spaceguard": {
            severity: inc.severity,
            status: inc.status,
            nis2_classification: inc.nis2Classification,
            sparta_techniques: inc.spartaTechniques,
            affected_asset_ids: inc.affectedAssetIds,
            detected_at: inc.detectedAt?.toISOString(),
            resolved_at: inc.resolvedAt?.toISOString(),
            time_to_detect_minutes: inc.timeToDetectMinutes,
            time_to_respond_minutes: inc.timeToRespondMinutes,
          },
        },
      };
      objects.push(stixInc);
    }
  }

  // Threat intel -> as-is STIX objects (they already are STIX)
  if (includeThreatIntel) {
    const intelRows = await db
      .select()
      .from(threatIntel)
      .limit(5000);

    for (const ti of intelRows) {
      // The `data` field is a full STIX 2.1 object
      const stixObj = ti.data as Record<string, unknown>;
      if (stixObj && typeof stixObj === "object" && stixObj.type) {
        objects.push({
          ...stixObj,
          spec_version: "2.1",
        } as StixObject);
      }
    }
  }

  return {
    type: "bundle",
    id: stixId("bundle", crypto.randomUUID()),
    objects,
  };
}
