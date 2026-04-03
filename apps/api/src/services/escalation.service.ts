/**
 * ENISA three-tier crisis escalation model.
 *
 * Levels:
 * 1. Cyber Incident - handled by Technical/CSIRT level
 * 2. Large-Scale Cyber Incident - Operational level, cross-sector coordination
 * 3. Cyber Crisis - Strategic level, political decision-making
 *
 * Auto-escalation criteria per ENISA Best Practices for Cyber Crisis Management.
 */

import { eq, and, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { incidents, auditLog } from "../db/schema/index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscalationCriteria {
  affectedAssetCount: number;
  degradationHours: number;
  crossBorderImpact: boolean;
  fleetPercentAffected: number;
  unavailableHours: number;
  multipleOrgsReporting: boolean;
}

export interface EscalationRecommendation {
  currentLevel: string;
  recommendedLevel: string;
  shouldEscalate: boolean;
  criteriaEvaluation: Array<{
    criterion: string;
    met: boolean;
    value: string;
    threshold: string;
  }>;
  managementLevel: string;
  csirtRequired: boolean;
}

// ---------------------------------------------------------------------------
// Auto-escalation thresholds
// ---------------------------------------------------------------------------

const LARGE_SCALE_THRESHOLDS = {
  affectedAssets: 3,
  degradationHours: 4,
  crossBorder: true,
};

const CRISIS_THRESHOLDS = {
  fleetPercentAffected: 50,
  unavailableHours: 24,
  multipleOrgs: true,
};

// ---------------------------------------------------------------------------
// Evaluate escalation
// ---------------------------------------------------------------------------

export async function evaluateEscalation(
  incidentId: string,
  organizationId: string,
): Promise<EscalationRecommendation> {
  const [incident] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.id, incidentId),
        eq(incidents.organizationId, organizationId),
      )
    )
    .limit(1);

  if (!incident) {
    throw new HTTPException(404, { message: `Incident ${incidentId} not found` });
  }

  const currentLevel = incident.escalationLevel;
  const affectedAssets = (incident.affectedAssetIds as string[]) ?? [];
  const affectedCount = affectedAssets.length;

  // Calculate degradation hours
  const detectedAt = incident.detectedAt ?? incident.createdAt;
  const hoursElapsed = (Date.now() - new Date(detectedAt).getTime()) / 3600000;
  const isResolved = ["CLOSED", "FALSE_POSITIVE"].includes(incident.status);

  // Fleet percentage (approximate from asset count)
  const [{ count: totalAssets }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`space_assets`)
    .where(sql`organization_id = ${organizationId} AND parent_asset_id IS NULL`);
  const fleetPercent = Number(totalAssets) > 0
    ? Math.round((affectedCount / Number(totalAssets)) * 100)
    : 0;

  const criteria: EscalationRecommendation["criteriaEvaluation"] = [];
  let recommendedLevel = currentLevel;
  let managementLevel = incident.managementLevel;
  let csirtRequired = incident.csirtNotificationStatus !== "NOT_REQUIRED";

  if (currentLevel === "CYBER_INCIDENT") {
    // Check for LARGE_SCALE
    const c1 = affectedCount > LARGE_SCALE_THRESHOLDS.affectedAssets;
    criteria.push({
      criterion: "Affected assets > 3",
      met: c1,
      value: String(affectedCount),
      threshold: String(LARGE_SCALE_THRESHOLDS.affectedAssets),
    });

    const c2 = !isResolved && hoursElapsed > LARGE_SCALE_THRESHOLDS.degradationHours;
    criteria.push({
      criterion: "Degradation > 4 hours",
      met: c2,
      value: `${hoursElapsed.toFixed(1)}h`,
      threshold: `${LARGE_SCALE_THRESHOLDS.degradationHours}h`,
    });

    const c3 = incident.crossBorderImpact;
    criteria.push({
      criterion: "Cross-border impact",
      met: c3,
      value: c3 ? "Yes" : "No",
      threshold: "Yes",
    });

    if (c1 || c2 || c3) {
      recommendedLevel = "LARGE_SCALE_INCIDENT";
      managementLevel = "OPERATIONAL";
      csirtRequired = true;
    }
  } else if (currentLevel === "LARGE_SCALE_INCIDENT") {
    // Check for CRISIS
    const c1 = fleetPercent > CRISIS_THRESHOLDS.fleetPercentAffected;
    criteria.push({
      criterion: "Fleet > 50% affected",
      met: c1,
      value: `${fleetPercent}%`,
      threshold: `${CRISIS_THRESHOLDS.fleetPercentAffected}%`,
    });

    const c2 = !isResolved && hoursElapsed > CRISIS_THRESHOLDS.unavailableHours;
    criteria.push({
      criterion: "Unavailable > 24 hours",
      met: c2,
      value: `${hoursElapsed.toFixed(1)}h`,
      threshold: `${CRISIS_THRESHOLDS.unavailableHours}h`,
    });

    if (c1 || c2) {
      recommendedLevel = "CYBER_CRISIS";
      managementLevel = "STRATEGIC";
      csirtRequired = true;
    }
  }

  return {
    currentLevel,
    recommendedLevel,
    shouldEscalate: recommendedLevel !== currentLevel,
    criteriaEvaluation: criteria,
    managementLevel,
    csirtRequired,
  };
}

// ---------------------------------------------------------------------------
// Escalate incident
// ---------------------------------------------------------------------------

export async function escalateIncident(
  incidentId: string,
  newLevel: string,
  reason: string,
  actor: string,
  organizationId: string,
) {
  const [incident] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.id, incidentId),
        eq(incidents.organizationId, organizationId),
      )
    )
    .limit(1);

  if (!incident) {
    throw new HTTPException(404, { message: `Incident ${incidentId} not found` });
  }

  const LEVEL_ORDER: Record<string, number> = {
    CYBER_INCIDENT: 0,
    LARGE_SCALE_INCIDENT: 1,
    CYBER_CRISIS: 2,
  };

  const currentOrder = LEVEL_ORDER[incident.escalationLevel] ?? 0;
  const newOrder = LEVEL_ORDER[newLevel] ?? 0;

  if (newOrder <= currentOrder) {
    throw new HTTPException(400, {
      message: `Cannot escalate from ${incident.escalationLevel} to ${newLevel}. Escalation must be to a higher level.`,
    });
  }

  const managementLevel = newLevel === "CYBER_CRISIS" ? "STRATEGIC" : newLevel === "LARGE_SCALE_INCIDENT" ? "OPERATIONAL" : "TECHNICAL";

  const now = new Date();

  // Update timeline
  const timeline = (incident.timeline as Array<Record<string, unknown>>) ?? [];
  timeline.push({
    timestamp: now.toISOString(),
    action: "ESCALATED",
    actor,
    details: `Escalated to ${newLevel}: ${reason}`,
  });

  await db
    .update(incidents)
    .set({
      escalationLevel: newLevel as typeof incident.escalationLevel,
      escalatedAt: now,
      escalationReason: reason,
      managementLevel: managementLevel as typeof incident.managementLevel,
      csirtNotificationStatus: newLevel !== "CYBER_INCIDENT" ? "PENDING" : incident.csirtNotificationStatus,
      timeline,
      updatedAt: now,
    })
    .where(eq(incidents.id, incidentId));

  // Audit log
  await db.insert(auditLog).values({
    organizationId,
    actor,
    action: "STATUS_CHANGE",
    resourceType: "incident",
    resourceId: incidentId,
    details: {
      type: "escalation",
      previousLevel: incident.escalationLevel,
      newLevel,
      managementLevel,
      reason,
    },
  });

  return {
    incidentId,
    previousLevel: incident.escalationLevel,
    newLevel,
    managementLevel,
    escalatedAt: now.toISOString(),
    reason,
  };
}

// ---------------------------------------------------------------------------
// Update CSIRT notification status
// ---------------------------------------------------------------------------

export async function updateCsirtStatus(
  incidentId: string,
  status: string,
  csirtContact: string | null,
  actor: string,
  organizationId: string,
) {
  const [incident] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.id, incidentId),
        eq(incidents.organizationId, organizationId),
      )
    )
    .limit(1);

  if (!incident) {
    throw new HTTPException(404, { message: `Incident ${incidentId} not found` });
  }

  const timeline = (incident.timeline as Array<Record<string, unknown>>) ?? [];
  timeline.push({
    timestamp: new Date().toISOString(),
    action: "CSIRT_STATUS_UPDATE",
    actor,
    details: `CSIRT notification status changed to ${status}`,
  });

  await db
    .update(incidents)
    .set({
      csirtNotificationStatus: status as typeof incident.csirtNotificationStatus,
      csirtContact: csirtContact ?? incident.csirtContact,
      timeline,
      updatedAt: new Date(),
    })
    .where(eq(incidents.id, incidentId));

  return { incidentId, csirtNotificationStatus: status, csirtContact };
}

// ---------------------------------------------------------------------------
// Crisis communication templates
// ---------------------------------------------------------------------------

export const CRISIS_TEMPLATES = [
  {
    id: "internal-escalation",
    name: "Internal Escalation Notice",
    level: "LARGE_SCALE_INCIDENT",
    template: "INCIDENT ESCALATION NOTICE\n\nIncident: {{title}}\nEscalation Level: {{level}}\nReason: {{reason}}\nAffected Assets: {{assetCount}}\nStatus: {{status}}\n\nImmediate actions required:\n1. Activate incident response team\n2. Assess service impact across all affected systems\n3. Prepare CSIRT notification if not already sent\n4. Brief operational management within 1 hour",
  },
  {
    id: "csirt-notification",
    name: "CSIRT Notification",
    level: "LARGE_SCALE_INCIDENT",
    template: "NIS2 INCIDENT NOTIFICATION\n\nOrganization: {{orgName}}\nIncident: {{title}}\nSeverity: {{severity}}\nClassification: {{nis2Classification}}\n\nAffected Services: Space operations\nAffected Assets: {{assetCount}} systems\nCross-border Impact: {{crossBorder}}\n\nInitial Assessment:\n{{description}}\n\nActions Taken: {{actionsDescription}}",
  },
  {
    id: "cross-border-alert",
    name: "Cross-Border Alert",
    level: "LARGE_SCALE_INCIDENT",
    template: "CROSS-BORDER CYBER INCIDENT ALERT\n\nOriginating State: {{originState}}\nAffected States: {{affectedStates}}\n\nIncident: {{title}}\nSector: Space Operations\nImpact: {{description}}\n\nRequested Actions:\n1. Monitor for similar indicators in your jurisdiction\n2. Share relevant threat intelligence\n3. Coordinate response through EU-CyCLONe if applicable",
  },
  {
    id: "public-communication",
    name: "Public Communication",
    level: "CYBER_CRISIS",
    template: "PUBLIC STATEMENT - CYBERSECURITY INCIDENT\n\n{{orgName}} is responding to a cybersecurity incident affecting our space operations.\n\nWhat we know:\n- The incident was detected on {{detectedDate}}\n- We are working with relevant authorities\n- Service impact: {{impactDescription}}\n\nWhat we are doing:\n- Our incident response team is fully activated\n- We have notified the relevant competent authorities\n- We are implementing our business continuity procedures\n\nWe will provide updates as the situation develops.",
  },
  {
    id: "recovery-notice",
    name: "Recovery Notice",
    level: "CYBER_INCIDENT",
    template: "INCIDENT RECOVERY NOTICE\n\nIncident: {{title}}\nResolution: {{resolutionDescription}}\n\nAll affected services have been restored to normal operations.\n\nRoot Cause: {{rootCause}}\nPreventive Measures: {{preventiveMeasures}}\n\nA full post-incident report will be available within {{reportDeadline}} days.",
  },
];
