/**
 * Satellite lifecycle phase management (ENISA / ECSS standard).
 *
 * Maps ENISA controls to lifecycle phases, enforces forward-only transitions,
 * auto-creates compliance mappings, and tracks security milestones / TLPT.
 */

import { eq, and, sql, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client";
import { spaceAssets, complianceRequirements, complianceMappings, auditLog } from "../db/schema/index";
import { LifecyclePhase } from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Phase ordering (numeric for comparison)
// ---------------------------------------------------------------------------

const PHASE_ORDER: Record<string, number> = {
  PHASE_0_MISSION_ANALYSIS: 0,
  PHASE_A_FEASIBILITY: 1,
  PHASE_B_DEFINITION: 2,
  PHASE_C_QUALIFICATION: 3,
  PHASE_D_PRODUCTION: 4,
  PHASE_E_OPERATIONS: 5,
  PHASE_F_DISPOSAL: 6,
};

// ---------------------------------------------------------------------------
// Phase -> ENISA control cluster mappings
// ---------------------------------------------------------------------------

const PHASE_CONTROL_CLUSTERS: Record<string, string[]> = {
  PHASE_0_MISSION_ANALYSIS: [
    "Security by Design",
    "Risk Assessment",
  ],
  PHASE_A_FEASIBILITY: [
    "Security by Design",
    "Risk Assessment",
    "Security Architecture",
  ],
  PHASE_B_DEFINITION: [
    "Security by Design",
    "Risk Assessment",
    "Security Architecture",
    "Cryptographic Security",
    "Supply Chain Security",
  ],
  PHASE_C_QUALIFICATION: [
    "Security by Design",
    "Security Testing",
    "Cryptographic Security",
    "Supply Chain Security",
    "Access Control",
    "Software Security",
    "Network Security",
  ],
  PHASE_D_PRODUCTION: [
    "Supply Chain Security",
    "Configuration Management",
    "Physical Security",
    "Access Control",
    "Software Security",
    "Cryptographic Security",
  ],
  PHASE_E_OPERATIONS: [], // All clusters apply
  PHASE_F_DISPOSAL: [
    "Data Protection",
    "Access Control",
    "Cryptographic Security",
    "Configuration Management",
    "Physical Security",
    "Incident Management",
  ],
};

// ---------------------------------------------------------------------------
// Security milestones per phase
// ---------------------------------------------------------------------------

export interface SecurityMilestone {
  id: string;
  phase: string;
  name: string;
  description: string;
  required: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "NOT_APPLICABLE";
  dueDescription: string;
}

const MILESTONE_TEMPLATES: Array<Omit<SecurityMilestone, "status">> = [
  {
    id: "MS-B-001",
    phase: "PHASE_B_DEFINITION",
    name: "Design Review Security Checklist",
    description: "Complete security architecture review covering threat model, attack surface analysis, and secure design patterns per ENISA Security by Design cluster.",
    required: true,
    dueDescription: "Before Phase B exit / Phase C entry",
  },
  {
    id: "MS-C-001",
    phase: "PHASE_C_QUALIFICATION",
    name: "Pre-Launch Security Assessment",
    description: "Comprehensive security testing including penetration testing of ground segment, code review of flight software, and supply chain audit.",
    required: true,
    dueDescription: "Before Phase C exit",
  },
  {
    id: "MS-C-002",
    phase: "PHASE_C_QUALIFICATION",
    name: "Threat-Led Penetration Testing (Pre-Launch)",
    description: "TLPT per EU Space Act requirements. Must cover ground segment, communication links, and mission control interfaces.",
    required: true,
    dueDescription: "Before launch (Phase C/D boundary)",
  },
  {
    id: "MS-D-001",
    phase: "PHASE_D_PRODUCTION",
    name: "Supply Chain Security Audit",
    description: "Verify all component suppliers meet security requirements. Validate SBOM accuracy and check for known vulnerabilities in all software components.",
    required: true,
    dueDescription: "Before integration / Phase D exit",
  },
  {
    id: "MS-E-001",
    phase: "PHASE_E_OPERATIONS",
    name: "Operational Security Baseline",
    description: "Establish security monitoring baseline: detection rules configured, telemetry streams active, incident response playbooks tested, compliance mappings complete.",
    required: true,
    dueDescription: "Within 30 days of Phase E entry",
  },
  {
    id: "MS-E-002",
    phase: "PHASE_E_OPERATIONS",
    name: "TLPT (Recurring, 3-Year Cycle)",
    description: "Recurring threat-led penetration testing per EU Space Act. Must cover all operational segments including ground stations, communication links, and mission operations.",
    required: true,
    dueDescription: "Every 3 years during Phase E",
  },
  {
    id: "MS-F-001",
    phase: "PHASE_F_DISPOSAL",
    name: "Secure Disposal Verification",
    description: "Verify data destruction on all ground and space segments, revoke all credentials and certificates, coordinate frequency deallocation, and archive audit trail.",
    required: true,
    dueDescription: "Before decommissioning completion",
  },
];

// ---------------------------------------------------------------------------
// Phase requirements
// ---------------------------------------------------------------------------

export interface PhaseRequirement {
  phase: string;
  clusters: string[];
  description: string;
  requirementCount: number;
}

export async function getPhaseRequirements(phase: string): Promise<PhaseRequirement> {
  const clusters = PHASE_CONTROL_CLUSTERS[phase];
  if (!clusters) {
    throw new HTTPException(400, { message: `Invalid lifecycle phase: ${phase}` });
  }

  let requirementCount = 0;
  if (clusters.length === 0) {
    // Phase E: all requirements
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(complianceRequirements);
    requirementCount = Number(total);
  } else {
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(complianceRequirements)
      .where(sql`${complianceRequirements.category} = ANY(ARRAY[${sql.join(clusters.map(c => sql`${c}`), sql`, `)}]::text[])`);
    requirementCount = Number(total);
  }

  const descriptions: Record<string, string> = {
    PHASE_0_MISSION_ANALYSIS: "Security by Design and initial risk assessment controls",
    PHASE_A_FEASIBILITY: "Security architecture definition and feasibility risk analysis",
    PHASE_B_DEFINITION: "Full security architecture, cryptographic design, and supply chain planning",
    PHASE_C_QUALIFICATION: "Security testing, access control verification, and pre-launch assessment",
    PHASE_D_PRODUCTION: "Supply chain validation, configuration management, and integration security",
    PHASE_E_OPERATIONS: "All operational security controls (full ENISA control set)",
    PHASE_F_DISPOSAL: "Data destruction, credential revocation, and secure decommissioning",
  };

  return {
    phase,
    clusters: clusters.length === 0 ? ["All clusters"] : clusters,
    description: descriptions[phase] ?? "",
    requirementCount,
  };
}

// ---------------------------------------------------------------------------
// Phase transition
// ---------------------------------------------------------------------------

export async function transitionPhase(
  assetId: string,
  newPhase: string,
  actor: string,
  organizationId: string,
): Promise<{
  asset: { id: string; name: string; lifecyclePhase: string };
  previousPhase: string;
  newPhase: string;
}> {
  // Validate phase value
  if (!PHASE_ORDER.hasOwnProperty(newPhase)) {
    throw new HTTPException(400, { message: `Invalid lifecycle phase: ${newPhase}` });
  }

  // Fetch asset
  const [asset] = await db
    .select()
    .from(spaceAssets)
    .where(and(eq(spaceAssets.id, assetId), eq(spaceAssets.organizationId, organizationId)))
    .limit(1);

  if (!asset) {
    throw new HTTPException(404, { message: `Asset ${assetId} not found` });
  }

  const currentPhase = asset.lifecyclePhase ?? "PHASE_E_OPERATIONS";
  const currentOrder = PHASE_ORDER[currentPhase] ?? 5;
  const newOrder = PHASE_ORDER[newPhase];

  // Validate forward-only (exception: F -> E for life extension)
  if (newOrder <= currentOrder) {
    if (!(currentPhase === "PHASE_F_DISPOSAL" && newPhase === "PHASE_E_OPERATIONS")) {
      throw new HTTPException(400, {
        message: `Cannot transition from ${currentPhase} to ${newPhase}. Transitions must be forward-only (exception: Phase F to E for life extension).`,
      });
    }
  }

  // Update asset
  const now = new Date();
  await db
    .update(spaceAssets)
    .set({
      lifecyclePhase: newPhase as typeof spaceAssets.lifecyclePhase.enumValues[number],
      lifecyclePhaseEnteredAt: now,
      updatedAt: now,
    })
    .where(eq(spaceAssets.id, assetId));

  // Audit log
  await db.insert(auditLog).values({
    organizationId,
    actor,
    action: "STATUS_CHANGE",
    resourceType: "asset",
    resourceId: assetId,
    details: {
      type: "lifecycle_transition",
      assetName: asset.name,
      previousPhase: currentPhase,
      newPhase,
    },
  });

  return {
    asset: { id: asset.id, name: asset.name, lifecyclePhase: newPhase },
    previousPhase: currentPhase,
    newPhase,
  };
}

// ---------------------------------------------------------------------------
// Security milestones
// ---------------------------------------------------------------------------

export async function getSecurityMilestones(
  assetId: string,
  organizationId: string,
): Promise<SecurityMilestone[]> {
  const [asset] = await db
    .select()
    .from(spaceAssets)
    .where(and(eq(spaceAssets.id, assetId), eq(spaceAssets.organizationId, organizationId)))
    .limit(1);

  if (!asset) {
    throw new HTTPException(404, { message: `Asset ${assetId} not found` });
  }

  const currentPhase = asset.lifecyclePhase ?? "PHASE_E_OPERATIONS";
  const currentOrder = PHASE_ORDER[currentPhase] ?? 5;

  return MILESTONE_TEMPLATES.map((m) => {
    const milestoneOrder = PHASE_ORDER[m.phase] ?? 5;
    let status: SecurityMilestone["status"];

    if (milestoneOrder < currentOrder) {
      // Past phases: assume completed (in real system, would track in DB)
      status = "COMPLETED";
    } else if (milestoneOrder === currentOrder) {
      status = "IN_PROGRESS";
    } else {
      status = "NOT_STARTED";
    }

    return { ...m, status };
  });
}

// ---------------------------------------------------------------------------
// TLPT schedule
// ---------------------------------------------------------------------------

export interface TlptEntry {
  assetId: string;
  assetName: string;
  assetType: string;
  lifecyclePhase: string;
  lastConducted: string | null;
  nextDue: string | null;
  overdue: boolean;
}

export async function getTlptSchedule(organizationId: string): Promise<TlptEntry[]> {
  // Get all operational assets (Phase E)
  const assets = await db
    .select()
    .from(spaceAssets)
    .where(
      and(
        eq(spaceAssets.organizationId, organizationId),
        eq(spaceAssets.lifecyclePhase, "PHASE_E_OPERATIONS"),
      )
    )
    .orderBy(spaceAssets.name);

  const now = new Date();

  // Check audit logs for TLPT events
  const tlptLogs = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        sql`${auditLog.details}->>'type' = 'tlpt_completed'`,
      )
    )
    .orderBy(desc(auditLog.timestamp));

  const lastTlptByAsset = new Map<string, Date>();
  for (const log of tlptLogs) {
    const rid = log.resourceId;
    if (rid && !lastTlptByAsset.has(rid)) {
      lastTlptByAsset.set(rid, log.timestamp);
    }
  }

  return assets.map((a) => {
    const lastDate = lastTlptByAsset.get(a.id);
    let nextDue: Date | null = null;
    let overdue = false;

    if (lastDate) {
      nextDue = new Date(lastDate);
      nextDue.setFullYear(nextDue.getFullYear() + 3);
      overdue = nextDue < now;
    } else {
      // Never tested: due based on phase entry + 1 year
      if (a.lifecyclePhaseEnteredAt) {
        nextDue = new Date(a.lifecyclePhaseEnteredAt);
        nextDue.setFullYear(nextDue.getFullYear() + 1);
        overdue = nextDue < now;
      }
    }

    return {
      assetId: a.id,
      assetName: a.name,
      assetType: a.assetType,
      lifecyclePhase: a.lifecyclePhase ?? "PHASE_E_OPERATIONS",
      lastConducted: lastDate?.toISOString() ?? null,
      nextDue: nextDue?.toISOString() ?? null,
      overdue,
    };
  });
}

// ---------------------------------------------------------------------------
// Fleet lifecycle overview
// ---------------------------------------------------------------------------

export interface FleetLifecycleEntry {
  id: string;
  name: string;
  assetType: string;
  segment: string | null;
  lifecyclePhase: string;
  lifecyclePhaseEnteredAt: string | null;
  endOfLifeDate: string | null;
  criticality: string;
  status: string;
}

export async function getFleetLifecycle(organizationId: string): Promise<FleetLifecycleEntry[]> {
  const assets = await db
    .select()
    .from(spaceAssets)
    .where(
      and(
        eq(spaceAssets.organizationId, organizationId),
        sql`${spaceAssets.parentAssetId} IS NULL`, // top-level only
      )
    )
    .orderBy(spaceAssets.name);

  return assets.map((a) => ({
    id: a.id,
    name: a.name,
    assetType: a.assetType,
    segment: a.segment,
    lifecyclePhase: a.lifecyclePhase ?? "PHASE_E_OPERATIONS",
    lifecyclePhaseEnteredAt: a.lifecyclePhaseEnteredAt?.toISOString() ?? null,
    endOfLifeDate: a.endOfLifeDate ?? null,
    criticality: a.criticality,
    status: a.status,
  }));
}
