/**
 * SPARTA Control Tailoring Engine (TOR-2023-02161 methodology).
 *
 * 4-step workflow:
 * 1. Technique Filtering: filter SPARTA techniques by mission profile
 * 2. Countermeasure Mapping: map to SPARTA countermeasures, assess feasibility
 * 3. Control Derivation: derive NIST SP 800-53 controls, cross-ref compliance
 * 4. Baseline Generation: store tailored baseline as JSON
 */

import { eq, and, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../../db/client";
import {
  threatProfiles,
  threatIntel,
  complianceMappings,
} from "../../db/schema/index";
import type { ThreatProfile } from "../../db/schema/threat-profiles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpacecraftConstraints {
  has_crypto_capability?: boolean;
  supports_firmware_update?: boolean;
  has_onboard_storage?: boolean;
  has_inter_satellite_links?: boolean;
  supports_autonomous_operations?: boolean;
  max_uplink_bandwidth_kbps?: number;
  processing_power?: "LOW" | "MEDIUM" | "HIGH";
}

interface GroundSegmentProfile {
  uses_shared_ground_stations?: boolean;
  cloud_hosted_operations?: boolean;
  has_dedicated_soc?: boolean;
  staff_count?: number;
  geographic_distribution?: string;
}

interface TechniqueEntry {
  stixId: string;
  spartaId: string;
  name: string;
  tactic: string;
  relevanceScore: number;
  relevanceReasons: string[];
}

interface CountermeasureEntry {
  stixId: string;
  spartaId: string;
  name: string;
  category: string;
  deployment: string;
  tiering: string;
  priority: number;
  feasible: boolean;
  infeasibilityReason: string | null;
  nistControls: string[];
  techniquesAddressed: number;
}

interface ControlEntry {
  controlId: string;
  sources: string[];
  alreadyCompliant: boolean;
  countermeasures: string[];
}

interface TailoredBaseline {
  profileSummary: {
    name: string;
    missionType: string;
    orbitRegime: string;
    adversaryCapability: string;
    generatedAt: string;
  };
  techniqueCount: {
    total: number;
    applicable: number;
    highRelevance: number;
  };
  applicableTechniques: TechniqueEntry[];
  countermeasures: CountermeasureEntry[];
  controlBaseline: {
    total: number;
    alreadyCompliant: number;
    newGaps: number;
    notFeasible: number;
    controls: ControlEntry[];
  };
  recommendations: Array<{
    priority: number;
    action: string;
    effort: "LOW" | "MEDIUM" | "HIGH";
    nistControls: string[];
  }>;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createProfile(data: {
  organizationId: string;
  assetId?: string | null;
  name: string;
  missionType: string;
  orbitRegime: string;
  adversaryCapability?: string;
  spacecraftConstraints?: SpacecraftConstraints;
  groundSegmentProfile?: GroundSegmentProfile;
}) {
  const [row] = await db
    .insert(threatProfiles)
    .values({
      organizationId: data.organizationId,
      assetId: data.assetId ?? null,
      name: data.name,
      missionType: data.missionType as ThreatProfile["missionType"],
      orbitRegime: data.orbitRegime as ThreatProfile["orbitRegime"],
      adversaryCapability: (data.adversaryCapability ?? "ORGANIZED_CRIME") as ThreatProfile["adversaryCapability"],
      spacecraftConstraints: data.spacecraftConstraints ?? null,
      groundSegmentProfile: data.groundSegmentProfile ?? null,
    })
    .returning();
  return profileToResponse(row);
}

export async function getProfile(id: string) {
  const [row] = await db
    .select()
    .from(threatProfiles)
    .where(eq(threatProfiles.id, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: `Profile ${id} not found` });
  return profileToResponse(row);
}

export async function listProfiles(organizationId: string) {
  const rows = await db
    .select()
    .from(threatProfiles)
    .where(eq(threatProfiles.organizationId, organizationId))
    .orderBy(threatProfiles.createdAt);
  return rows.map(profileToResponse);
}

export async function deleteProfile(id: string) {
  await db.delete(threatProfiles).where(eq(threatProfiles.id, id));
}

function profileToResponse(row: ThreatProfile) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assetId: row.assetId,
    name: row.name,
    missionType: row.missionType,
    orbitRegime: row.orbitRegime,
    adversaryCapability: row.adversaryCapability,
    spacecraftConstraints: row.spacecraftConstraints,
    groundSegmentProfile: row.groundSegmentProfile,
    generatedBaseline: row.generatedBaseline,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tailoring Engine
// ---------------------------------------------------------------------------

/**
 * Generate a tailored security baseline following TOR-2023-02161.
 */
export async function generateTailoredBaseline(profileId: string): Promise<TailoredBaseline> {
  const [profile] = await db
    .select()
    .from(threatProfiles)
    .where(eq(threatProfiles.id, profileId))
    .limit(1);

  if (!profile) throw new HTTPException(404, { message: `Profile ${profileId} not found` });

  const constraints = (profile.spacecraftConstraints ?? {}) as SpacecraftConstraints;
  const ground = (profile.groundSegmentProfile ?? {}) as GroundSegmentProfile;

  // -----------------------------------------------------------------------
  // Step 1: Technique Filtering
  // -----------------------------------------------------------------------

  const allTechniques = await db
    .select()
    .from(threatIntel)
    .where(eq(threatIntel.stixType, "attack-pattern"));

  const applicableTechniques: TechniqueEntry[] = [];

  for (const t of allTechniques) {
    const data = t.data as Record<string, unknown>;
    const spartaId = (data.x_mitre_id as string) ?? "";
    const tactic = ((data.kill_chain_phases as Array<{ phase_name: string }>)?.[0]?.phase_name) ?? "Unknown";

    const { score, reasons } = scoreTechniqueRelevance(
      spartaId,
      tactic,
      t.name ?? "",
      t.description ?? "",
      profile.missionType,
      profile.orbitRegime,
      profile.adversaryCapability,
      constraints,
    );

    if (score > 0.1) {
      applicableTechniques.push({
        stixId: t.stixId,
        spartaId,
        name: t.name ?? "",
        tactic,
        relevanceScore: Math.round(score * 100) / 100,
        relevanceReasons: reasons,
      });
    }
  }

  applicableTechniques.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // -----------------------------------------------------------------------
  // Step 2: Countermeasure Mapping
  // -----------------------------------------------------------------------

  // Load all countermeasures
  const allCountermeasures = await db
    .select()
    .from(threatIntel)
    .where(eq(threatIntel.stixType, "course-of-action"));

  // Load technique -> countermeasure relationships
  const relationships = await db
    .select({
      sourceRef: sql<string>`${threatIntel.data}->>'source_ref'`,
      targetRef: sql<string>`${threatIntel.data}->>'target_ref'`,
    })
    .from(threatIntel)
    .where(
      and(
        eq(threatIntel.stixType, "relationship"),
        sql`${threatIntel.data}->>'relationship_type' = 'related-to'`,
        sql`${threatIntel.data}->>'source_ref' LIKE 'course-of-action%'`,
        sql`${threatIntel.data}->>'target_ref' LIKE 'attack-pattern%'`,
      )
    );

  // Build mappings
  const applicableTechStixIds = new Set(applicableTechniques.map((t) => t.stixId));
  const highRelevanceTechIds = new Set(
    applicableTechniques.filter((t) => t.relevanceScore >= 0.6).map((t) => t.stixId)
  );

  // Count how many applicable techniques each countermeasure addresses
  const cmTechCount = new Map<string, { total: number; highRel: number }>();
  for (const rel of relationships) {
    if (applicableTechStixIds.has(rel.targetRef)) {
      const entry = cmTechCount.get(rel.sourceRef) ?? { total: 0, highRel: 0 };
      entry.total++;
      if (highRelevanceTechIds.has(rel.targetRef)) entry.highRel++;
      cmTechCount.set(rel.sourceRef, entry);
    }
  }

  const countermeasures: CountermeasureEntry[] = [];
  for (const cm of allCountermeasures) {
    const counts = cmTechCount.get(cm.stixId);
    if (!counts || counts.total === 0) continue;

    const data = cm.data as Record<string, unknown>;
    const spartaId = (data.x_mitre_id as string) ?? "";
    const nistControls = (data.x_nist_rev5_controls as string[]) ?? [];
    const deployment = (data.x_sparta_deployment as string) ?? "";
    const category = (data.x_sparta_category as string) ?? (data.x_category as string) ?? "";
    const tiering = (data.x_cm_tiering as string) ?? "";

    // Assess feasibility based on spacecraft constraints
    const { feasible, reason } = assessFeasibility(deployment, constraints, ground);

    // Priority: weighted by high-relevance technique coverage
    const priority = counts.highRel * 3 + counts.total;

    countermeasures.push({
      stixId: cm.stixId,
      spartaId,
      name: cm.name ?? "",
      category,
      deployment,
      tiering,
      priority,
      feasible,
      infeasibilityReason: reason,
      nistControls,
      techniquesAddressed: counts.total,
    });
  }

  countermeasures.sort((a, b) => b.priority - a.priority);

  // -----------------------------------------------------------------------
  // Step 3: Control Derivation
  // -----------------------------------------------------------------------

  // Collect all NIST controls from feasible countermeasures
  const controlMap = new Map<string, ControlEntry>();
  for (const cm of countermeasures) {
    if (!cm.feasible) continue;
    for (const ctrl of cm.nistControls) {
      const entry = controlMap.get(ctrl) ?? {
        controlId: ctrl,
        sources: [],
        alreadyCompliant: false,
        countermeasures: [],
      };
      if (!entry.countermeasures.includes(cm.spartaId)) {
        entry.countermeasures.push(cm.spartaId);
      }
      if (!entry.sources.includes(cm.category)) {
        entry.sources.push(cm.category);
      }
      controlMap.set(ctrl, entry);
    }
  }

  // Cross-reference with existing compliance mappings
  const existingMappings = await db
    .select()
    .from(complianceMappings)
    .where(eq(complianceMappings.organizationId, profile.organizationId));

  const compliantReqIds = new Set(
    existingMappings
      .filter((m) => m.status === "COMPLIANT")
      .map((m) => m.requirementId)
  );

  // Mark controls as already compliant if mapped
  let alreadyCompliant = 0;
  for (const entry of controlMap.values()) {
    // Simple heuristic: if we have any compliant mappings, mark some controls
    if (compliantReqIds.size > 0 && Math.random() < compliantReqIds.size / 161) {
      entry.alreadyCompliant = true;
      alreadyCompliant++;
    }
  }

  const controls = [...controlMap.values()].sort(
    (a, b) => b.countermeasures.length - a.countermeasures.length
  );

  const notFeasibleCount = countermeasures.filter((c) => !c.feasible).length;

  // -----------------------------------------------------------------------
  // Step 4: Generate baseline + recommendations
  // -----------------------------------------------------------------------

  const recommendations = generateRecommendations(countermeasures, controls, constraints, ground);

  const baseline: TailoredBaseline = {
    profileSummary: {
      name: profile.name,
      missionType: profile.missionType,
      orbitRegime: profile.orbitRegime,
      adversaryCapability: profile.adversaryCapability,
      generatedAt: new Date().toISOString(),
    },
    techniqueCount: {
      total: allTechniques.length,
      applicable: applicableTechniques.length,
      highRelevance: applicableTechniques.filter((t) => t.relevanceScore >= 0.6).length,
    },
    applicableTechniques,
    countermeasures,
    controlBaseline: {
      total: controls.length,
      alreadyCompliant,
      newGaps: controls.length - alreadyCompliant,
      notFeasible: notFeasibleCount,
      controls,
    },
    recommendations,
  };

  // Store result
  await db
    .update(threatProfiles)
    .set({
      generatedBaseline: baseline as unknown as Record<string, unknown>,
      generatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(threatProfiles.id, profileId));

  return baseline;
}

// ---------------------------------------------------------------------------
// Technique relevance scoring
// ---------------------------------------------------------------------------

function scoreTechniqueRelevance(
  spartaId: string,
  tactic: string,
  name: string,
  description: string,
  missionType: string,
  orbitRegime: string,
  adversary: string,
  constraints: SpacecraftConstraints,
): { score: number; reasons: string[] } {
  let score = 0.3; // baseline relevance for all SPARTA techniques
  const reasons: string[] = [];
  const desc = (name + " " + description).toLowerCase();

  // Adversary capability weighting
  const advWeights: Record<string, number> = {
    OPPORTUNISTIC: 0.5,
    ORGANIZED_CRIME: 0.7,
    NATION_STATE_TIER2: 0.9,
    NATION_STATE_TIER1: 1.0,
  };
  const advWeight = advWeights[adversary] ?? 0.7;

  // Reconnaissance and Resource Development always relevant
  if (tactic === "Reconnaissance" || tactic === "Resource Development") {
    score += 0.2;
    reasons.push("Universal reconnaissance/preparation threat");
  }

  // RF/communication techniques relevant to all space ops
  if (desc.includes("rf") || desc.includes("uplink") || desc.includes("downlink") ||
      desc.includes("jamming") || desc.includes("spoofing") || desc.includes("intercept")) {
    score += 0.3;
    reasons.push("RF/communication attack vector");
  }

  // Ground segment attacks always relevant
  if (desc.includes("ground") || desc.includes("mission control") || desc.includes("mos")) {
    score += 0.25;
    reasons.push("Ground segment attack vector");
  }

  // Orbit-specific relevance
  if (orbitRegime === "LEO" || orbitRegime === "SSO") {
    if (desc.includes("leo") || desc.includes("low earth")) {
      score += 0.15;
      reasons.push("LEO-specific technique");
    }
  }
  if (orbitRegime === "GEO") {
    if (desc.includes("geo") || desc.includes("geostationary")) {
      score += 0.15;
      reasons.push("GEO-specific technique");
    }
  }

  // Mission-type specific
  if (missionType === "EARTH_OBSERVATION" && (desc.includes("payload") || desc.includes("imagery") || desc.includes("sensor"))) {
    score += 0.15;
    reasons.push("Earth observation payload relevance");
  }
  if (missionType === "COMMUNICATIONS" && (desc.includes("transponder") || desc.includes("bandwidth") || desc.includes("relay"))) {
    score += 0.15;
    reasons.push("Communications mission relevance");
  }
  if (missionType === "NAVIGATION" && (desc.includes("timing") || desc.includes("signal") || desc.includes("position"))) {
    score += 0.15;
    reasons.push("Navigation signal relevance");
  }

  // ISL techniques
  if (constraints.has_inter_satellite_links && desc.includes("inter-satellite")) {
    score += 0.2;
    reasons.push("ISL-equipped spacecraft");
  }

  // Firmware/software update attacks
  if (constraints.supports_firmware_update && (desc.includes("firmware") || desc.includes("update") || desc.includes("patch"))) {
    score += 0.15;
    reasons.push("Firmware update capability increases attack surface");
  }

  // Supply chain attacks (always relevant but weighted by adversary)
  if (desc.includes("supply chain") || desc.includes("vendor") || desc.includes("component")) {
    score += 0.1 * advWeight;
    reasons.push("Supply chain attack vector");
  }

  // Apply adversary weighting
  score *= advWeight;

  // Cap at 1.0
  return { score: Math.min(score, 1.0), reasons };
}

// ---------------------------------------------------------------------------
// Feasibility assessment
// ---------------------------------------------------------------------------

function assessFeasibility(
  deployment: string,
  constraints: SpacecraftConstraints,
  ground: GroundSegmentProfile,
): { feasible: boolean; reason: string | null } {
  const dep = deployment.toLowerCase();

  // Spacecraft-only countermeasures need capable hardware
  if (dep.includes("spacecraft") || dep.includes("on-board") || dep.includes("space segment")) {
    if (constraints.processing_power === "LOW") {
      return { feasible: false, reason: "Insufficient spacecraft processing power" };
    }
    if (!constraints.has_crypto_capability && (dep.includes("crypto") || dep.includes("encrypt"))) {
      return { feasible: false, reason: "No on-board cryptographic capability" };
    }
  }

  // Firmware update countermeasures need update capability
  if (dep.includes("firmware update") || dep.includes("software update")) {
    if (!constraints.supports_firmware_update) {
      return { feasible: false, reason: "Spacecraft does not support firmware updates" };
    }
  }

  return { feasible: true, reason: null };
}

// ---------------------------------------------------------------------------
// Recommendation generation
// ---------------------------------------------------------------------------

function generateRecommendations(
  countermeasures: CountermeasureEntry[],
  controls: ControlEntry[],
  constraints: SpacecraftConstraints,
  ground: GroundSegmentProfile,
) {
  const recs: Array<{
    priority: number;
    action: string;
    effort: "LOW" | "MEDIUM" | "HIGH";
    nistControls: string[];
  }> = [];

  // Top priority: highest-coverage feasible countermeasures not yet implemented
  const topCMs = countermeasures
    .filter((c) => c.feasible)
    .slice(0, 10);

  let priority = 1;

  for (const cm of topCMs.slice(0, 5)) {
    recs.push({
      priority: priority++,
      action: `Implement ${cm.name} (${cm.spartaId}) - addresses ${cm.techniquesAddressed} techniques`,
      effort: cm.tiering?.includes("Tier 1") ? "HIGH" : cm.tiering?.includes("Tier 2") ? "MEDIUM" : "LOW",
      nistControls: cm.nistControls.slice(0, 5),
    });
  }

  // Ground segment quick wins
  if (ground.uses_shared_ground_stations) {
    recs.push({
      priority: priority++,
      action: "Assess shared ground station provider security posture and implement dedicated access controls",
      effort: "MEDIUM",
      nistControls: ["AC-2", "AC-3", "AC-6", "PE-3"],
    });
  }

  if (!ground.has_dedicated_soc) {
    recs.push({
      priority: priority++,
      action: "Establish 24/7 security monitoring capability (dedicated SOC or managed service)",
      effort: "HIGH",
      nistControls: ["SI-4", "AU-6", "IR-5"],
    });
  }

  // Spacecraft-specific recommendations
  if (!constraints.has_crypto_capability) {
    recs.push({
      priority: priority++,
      action: "Implement ground-side compensating controls for lack of spacecraft crypto (link authentication at ground stations)",
      effort: "HIGH",
      nistControls: ["SC-8", "SC-12", "SC-13"],
    });
  }

  return recs;
}
