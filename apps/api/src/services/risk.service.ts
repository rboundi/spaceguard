/**
 * Risk Scoring Engine
 *
 * Calculates a 0-100 risk score for each asset based on 5 dimensions:
 *   1. Compliance Gap Score   (30%)
 *   2. Threat Exposure Score  (25%)
 *   3. Alert History Score    (25%)
 *   4. Supply Chain Score     (10%)
 *   5. Configuration Score    (10%)
 *
 * Higher score = higher risk.
 */

import { eq, and, gte, sql, desc, isNull, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { spaceAssets } from "../db/schema/assets";
import { complianceMappings, complianceRequirements } from "../db/schema/compliance";
import { alerts } from "../db/schema/alerts";
import { suppliers } from "../db/schema/supply-chain";
import { threatIntel } from "../db/schema/intel";
import { riskScoresHistory } from "../db/schema/risk";
import type { RiskBreakdown, RiskTrend, RiskScore } from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const WEIGHTS = {
  compliance: 0.30,
  threat: 0.25,
  alerts: 0.25,
  supplyChain: 0.10,
  config: 0.10,
} as const;

const SEVERITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 1,
};

// ---------------------------------------------------------------------------
// 1. Compliance Gap Score
// ---------------------------------------------------------------------------

async function complianceScore(
  assetId: string,
  organizationId: string,
): Promise<{ score: number; details: string[] }> {
  // Get compliance mappings for this asset and org-level ones
  const mappings = await db
    .select({
      status: complianceMappings.status,
      title: complianceRequirements.title,
    })
    .from(complianceMappings)
    .innerJoin(
      complianceRequirements,
      eq(complianceMappings.requirementId, complianceRequirements.id),
    )
    .where(
      and(
        eq(complianceMappings.organizationId, organizationId),
        // Include both asset-specific and org-level mappings
        sql`(${complianceMappings.assetId} = ${assetId} OR ${complianceMappings.assetId} IS NULL)`,
      ),
    );

  if (mappings.length === 0) return { score: 75, details: ["No compliance mappings assessed"] };

  const gaps = mappings.filter(
    (m) => m.status === "NON_COMPLIANT" || m.status === "NOT_ASSESSED",
  );

  const score = Math.round((gaps.length / mappings.length) * 100);

  const details: string[] = [];
  const nonCompliant = gaps.filter((g) => g.status === "NON_COMPLIANT");
  if (nonCompliant.length > 0) {
    details.push(`${nonCompliant.length} non-compliant requirement(s): ${nonCompliant.slice(0, 2).map((g) => g.title).join(", ")}`);
  }
  const notAssessed = gaps.filter((g) => g.status === "NOT_ASSESSED");
  if (notAssessed.length > 0) {
    details.push(`${notAssessed.length} requirement(s) not yet assessed`);
  }

  return { score, details };
}

// ---------------------------------------------------------------------------
// 2. Threat Exposure Score
// ---------------------------------------------------------------------------

// Mapping of asset types to relevant SPARTA tactic keywords
const ASSET_TACTIC_MAP: Record<string, string[]> = {
  LEO_SATELLITE: ["Reconnaissance", "Execution", "Persistence", "Exfiltration", "Inhibit Response"],
  MEO_SATELLITE: ["Reconnaissance", "Execution", "Persistence", "Exfiltration", "Inhibit Response"],
  GEO_SATELLITE: ["Reconnaissance", "Execution", "Persistence", "Exfiltration", "Inhibit Response"],
  GROUND_STATION: ["Initial Access", "Lateral Movement", "Command and Control", "Collection"],
  CONTROL_CENTER: ["Initial Access", "Lateral Movement", "Privilege Escalation", "Impact"],
  UPLINK: ["Command and Control", "Denial of Service", "Jamming"],
  DOWNLINK: ["Exfiltration", "Eavesdropping", "Spoofing"],
  INTER_SATELLITE_LINK: ["Lateral Movement", "Eavesdropping"],
  DATA_CENTER: ["Initial Access", "Collection", "Impact", "Privilege Escalation"],
  NETWORK_SEGMENT: ["Lateral Movement", "Discovery", "Command and Control"],
};

async function threatScore(
  assetType: string,
): Promise<{ score: number; details: string[] }> {
  // Count total SPARTA attack-patterns
  const totalTechniques = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(threatIntel)
    .where(eq(threatIntel.stixType, "attack-pattern"));

  const total = totalTechniques[0]?.count ?? 0;
  if (total === 0) return { score: 30, details: ["No SPARTA techniques loaded"] };

  // Count countermeasures (course-of-action) that are linked via relationships
  const countermeasures = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(threatIntel)
    .where(eq(threatIntel.stixType, "course-of-action"));

  const cmCount = countermeasures[0]?.count ?? 0;

  // Estimate coverage: if we have countermeasures, assume some coverage
  const coverageRatio = total > 0 ? Math.min(cmCount / total, 1.0) : 0;

  // Asset types with more attack surface get higher base scores
  const relevantTactics = ASSET_TACTIC_MAP[assetType] ?? [];
  const tacticsMultiplier = Math.min(relevantTactics.length / 5, 1.0);

  const score = Math.round((1 - coverageRatio) * 70 + tacticsMultiplier * 30);

  const details: string[] = [];
  if (coverageRatio < 0.5) {
    details.push(`Low countermeasure coverage (${Math.round(coverageRatio * 100)}% of ${total} techniques)`);
  }
  if (relevantTactics.length >= 4) {
    details.push(`High threat surface: ${relevantTactics.length} applicable attack tactics`);
  }

  return { score: Math.min(score, 100), details };
}

// ---------------------------------------------------------------------------
// 3. Alert History Score
// ---------------------------------------------------------------------------

async function alertScore(
  assetId: string,
  organizationId: string,
): Promise<{ score: number; details: string[] }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get alerts for this asset in the last 30 days
  const assetAlerts = await db
    .select({
      severity: alerts.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(alerts)
    .where(
      and(
        eq(alerts.organizationId, organizationId),
        eq(alerts.affectedAssetId, assetId),
        gte(alerts.triggeredAt, thirtyDaysAgo),
      ),
    )
    .groupBy(alerts.severity);

  // Get fleet-wide alert weight sum for normalization
  const fleetAlerts = await db
    .select({
      severity: alerts.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(alerts)
    .where(
      and(
        eq(alerts.organizationId, organizationId),
        gte(alerts.triggeredAt, thirtyDaysAgo),
      ),
    )
    .groupBy(alerts.severity);

  // Calculate weighted sums
  let assetWeighted = 0;
  let totalAlertCount = 0;
  for (const row of assetAlerts) {
    const w = SEVERITY_WEIGHTS[row.severity] ?? 1;
    assetWeighted += row.count * w;
    totalAlertCount += row.count;
  }

  let fleetWeighted = 0;
  for (const row of fleetAlerts) {
    const w = SEVERITY_WEIGHTS[row.severity] ?? 1;
    fleetWeighted += row.count * w;
  }

  // Normalize to 0-100 based on fleet comparison
  const score =
    fleetWeighted > 0
      ? Math.round(Math.min((assetWeighted / fleetWeighted) * 100, 100))
      : assetWeighted > 0
        ? Math.min(assetWeighted * 5, 100)
        : 0;

  const details: string[] = [];
  if (totalAlertCount > 0) {
    const criticals = assetAlerts.find((a) => a.severity === "CRITICAL");
    const highs = assetAlerts.find((a) => a.severity === "HIGH");
    if (criticals && criticals.count > 0) {
      details.push(`${criticals.count} critical alert(s) in last 30 days`);
    }
    if (highs && highs.count > 0) {
      details.push(`${highs.count} high-severity alert(s) in last 30 days`);
    }
  }

  return { score, details };
}

// ---------------------------------------------------------------------------
// 4. Supply Chain Score
// ---------------------------------------------------------------------------

async function supplyChainScore(
  organizationId: string,
): Promise<{ score: number; details: string[] }> {
  const orgSuppliers = await db
    .select({
      name: suppliers.name,
      criticality: suppliers.criticality,
      securityAssessment: suppliers.securityAssessment,
    })
    .from(suppliers)
    .where(eq(suppliers.organizationId, organizationId));

  if (orgSuppliers.length === 0) {
    return { score: 50, details: ["No suppliers mapped (unknown supply chain risk)"] };
  }

  // Score based on supplier criticality and assessment status
  let totalRisk = 0;
  const unassessed: string[] = [];

  for (const supplier of orgSuppliers) {
    const assessment = supplier.securityAssessment as Record<string, unknown> | null;
    const hasIso27001 = assessment?.iso27001 === true;
    const hasSoc2 = assessment?.soc2 === true;
    const hasNis2 = assessment?.nis2Compliant === true;

    const critWeight =
      supplier.criticality === "CRITICAL" ? 4 :
      supplier.criticality === "HIGH" ? 3 :
      supplier.criticality === "MEDIUM" ? 2 : 1;

    let supplierRisk = 50 * critWeight; // base risk
    if (hasIso27001) supplierRisk -= 15 * critWeight;
    if (hasSoc2) supplierRisk -= 10 * critWeight;
    if (hasNis2) supplierRisk -= 15 * critWeight;

    if (!hasIso27001 && !hasSoc2 && !hasNis2) {
      unassessed.push(supplier.name);
    }

    totalRisk += Math.max(0, supplierRisk);
  }

  // Normalize
  const maxPossible = orgSuppliers.length * 200; // worst case
  const score = Math.round(Math.min((totalRisk / maxPossible) * 100, 100));

  const details: string[] = [];
  if (unassessed.length > 0) {
    details.push(`${unassessed.length} supplier(s) lack security certifications: ${unassessed.slice(0, 2).join(", ")}`);
  }

  return { score, details };
}

// ---------------------------------------------------------------------------
// 5. Configuration Score
// ---------------------------------------------------------------------------

async function configScore(
  asset: { status: string; metadata: unknown; criticality: string },
): Promise<{ score: number; details: string[] }> {
  let score = 30; // baseline moderate risk
  const details: string[] = [];
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;

  // Maintenance status
  if (asset.status === "MAINTENANCE") {
    score += 20;
    details.push("Asset is in MAINTENANCE status");
  }
  if (asset.status === "DEGRADED") {
    score += 10;
    details.push("Asset is in DEGRADED status");
  }

  // Check encryption
  if (meta.encryptionEnabled === false || meta.encryption === false) {
    score += 20;
    details.push("Encryption not enabled");
  } else if (meta.encryptionEnabled === true || meta.encryption === true) {
    score -= 15;
  }

  // Check MFA
  if (meta.mfaRequired === false || meta.mfa === false) {
    score += 10;
    details.push("MFA not required for access");
  } else if (meta.mfaRequired === true || meta.mfa === true) {
    score -= 10;
  }

  // Check patch status
  if (meta.lastPatched) {
    const patchDate = new Date(meta.lastPatched as string);
    const daysSincePatch = (Date.now() - patchDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePatch > 90) {
      score += 15;
      details.push(`Not patched in ${Math.round(daysSincePatch)} days`);
    }
  }

  // Critical assets with degraded status get extra penalty
  if (asset.criticality === "CRITICAL" && asset.status !== "OPERATIONAL") {
    score += 10;
    details.push("Critical asset not in OPERATIONAL status");
  }

  return { score: Math.max(0, Math.min(100, score)), details };
}

// ---------------------------------------------------------------------------
// Calculate trend by comparing to 30 days ago
// ---------------------------------------------------------------------------

async function calculateTrend(
  assetId: string | null,
  organizationId: string,
  currentScore: number,
): Promise<RiskTrend> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const condition = assetId
    ? and(
        eq(riskScoresHistory.organizationId, organizationId),
        eq(riskScoresHistory.assetId, assetId),
        gte(riskScoresHistory.calculatedAt, thirtyDaysAgo),
      )
    : and(
        eq(riskScoresHistory.organizationId, organizationId),
        isNull(riskScoresHistory.assetId),
        gte(riskScoresHistory.calculatedAt, thirtyDaysAgo),
      );

  const history = await db
    .select({ score: riskScoresHistory.score })
    .from(riskScoresHistory)
    .where(condition)
    .orderBy(riskScoresHistory.calculatedAt)
    .limit(1);

  if (history.length === 0) return "STABLE";

  const oldScore = history[0].score;
  const delta = currentScore - oldScore;

  if (delta <= -5) return "IMPROVING";
  if (delta >= 5) return "DEGRADING";
  return "STABLE";
}

// ---------------------------------------------------------------------------
// Public API: Calculate Asset Risk
// ---------------------------------------------------------------------------

export async function calculateAssetRisk(assetId: string): Promise<RiskScore & { assetId: string; assetName: string; assetType: string; criticality: string }> {
  // Fetch asset
  const [asset] = await db
    .select()
    .from(spaceAssets)
    .where(eq(spaceAssets.id, assetId))
    .limit(1);

  if (!asset) {
    throw new Error(`Asset ${assetId} not found`);
  }

  // Calculate each dimension
  const [comp, threat, alertH, supply, conf] = await Promise.all([
    complianceScore(assetId, asset.organizationId),
    threatScore(asset.assetType),
    alertScore(assetId, asset.organizationId),
    supplyChainScore(asset.organizationId),
    configScore({
      status: asset.status,
      metadata: asset.metadata,
      criticality: asset.criticality,
    }),
  ]);

  const breakdown: RiskBreakdown = {
    compliance: comp.score,
    threat: threat.score,
    alerts: alertH.score,
    supplyChain: supply.score,
    config: conf.score,
  };

  const overall = Math.round(
    breakdown.compliance * WEIGHTS.compliance +
    breakdown.threat * WEIGHTS.threat +
    breakdown.alerts * WEIGHTS.alerts +
    breakdown.supplyChain * WEIGHTS.supplyChain +
    breakdown.config * WEIGHTS.config,
  );

  // Collect top risks from all dimensions
  const allDetails = [
    ...comp.details,
    ...threat.details,
    ...alertH.details,
    ...supply.details,
    ...conf.details,
  ];
  const topRisks = allDetails.slice(0, 3);

  const trend = await calculateTrend(assetId, asset.organizationId, overall);

  return {
    assetId: asset.id,
    assetName: asset.name,
    assetType: asset.assetType,
    criticality: asset.criticality,
    overall,
    breakdown,
    trend,
    topRisks,
  };
}

// ---------------------------------------------------------------------------
// Public API: Calculate Org Risk (aggregate)
// ---------------------------------------------------------------------------

export async function calculateOrgRisk(organizationId: string): Promise<{
  organizationId: string;
  overall: number;
  breakdown: RiskBreakdown;
  trend: RiskTrend;
  topRisks: string[];
  assetCount: number;
  highRiskAssetCount: number;
}> {
  // Get all active assets for the org
  const orgAssets = await db
    .select({ id: spaceAssets.id })
    .from(spaceAssets)
    .where(
      and(
        eq(spaceAssets.organizationId, organizationId),
        sql`${spaceAssets.status} != 'DECOMMISSIONED'`,
      ),
    );

  if (orgAssets.length === 0) {
    return {
      organizationId,
      overall: 0,
      breakdown: { compliance: 0, threat: 0, alerts: 0, supplyChain: 0, config: 0 },
      trend: "STABLE",
      topRisks: ["No active assets"],
      assetCount: 0,
      highRiskAssetCount: 0,
    };
  }

  // Calculate risk for each asset
  const assetRisks = await Promise.all(
    orgAssets.map((a) => calculateAssetRisk(a.id)),
  );

  // Aggregate: weighted average by criticality
  const critWeights: Record<string, number> = {
    CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
  };

  let totalWeight = 0;
  const aggBreakdown = { compliance: 0, threat: 0, alerts: 0, supplyChain: 0, config: 0 };

  for (const ar of assetRisks) {
    const w = critWeights[ar.criticality] ?? 2;
    totalWeight += w;
    aggBreakdown.compliance += ar.breakdown.compliance * w;
    aggBreakdown.threat += ar.breakdown.threat * w;
    aggBreakdown.alerts += ar.breakdown.alerts * w;
    aggBreakdown.supplyChain += ar.breakdown.supplyChain * w;
    aggBreakdown.config += ar.breakdown.config * w;
  }

  if (totalWeight > 0) {
    aggBreakdown.compliance = Math.round(aggBreakdown.compliance / totalWeight);
    aggBreakdown.threat = Math.round(aggBreakdown.threat / totalWeight);
    aggBreakdown.alerts = Math.round(aggBreakdown.alerts / totalWeight);
    aggBreakdown.supplyChain = Math.round(aggBreakdown.supplyChain / totalWeight);
    aggBreakdown.config = Math.round(aggBreakdown.config / totalWeight);
  }

  const overall = Math.round(
    aggBreakdown.compliance * WEIGHTS.compliance +
    aggBreakdown.threat * WEIGHTS.threat +
    aggBreakdown.alerts * WEIGHTS.alerts +
    aggBreakdown.supplyChain * WEIGHTS.supplyChain +
    aggBreakdown.config * WEIGHTS.config,
  );

  // Collect top risks across all assets
  const allTopRisks = assetRisks
    .flatMap((ar) => ar.topRisks.map((r) => ({ risk: r, score: ar.overall })))
    .sort((a, b) => b.score - a.score);

  // Deduplicate
  const seen = new Set<string>();
  const topRisks: string[] = [];
  for (const { risk } of allTopRisks) {
    if (!seen.has(risk)) {
      seen.add(risk);
      topRisks.push(risk);
    }
    if (topRisks.length >= 5) break;
  }

  const trend = await calculateTrend(null, organizationId, overall);
  const highRiskAssetCount = assetRisks.filter((ar) => ar.overall > 60).length;

  return {
    organizationId,
    overall,
    breakdown: aggBreakdown,
    trend,
    topRisks,
    assetCount: orgAssets.length,
    highRiskAssetCount,
  };
}

// ---------------------------------------------------------------------------
// Public API: Get risk overview (org + all assets ranked)
// ---------------------------------------------------------------------------

export async function getRiskOverview(organizationId: string) {
  const orgRisk = await calculateOrgRisk(organizationId);

  // Get all asset risks (already calculated in calculateOrgRisk but we need full details)
  const orgAssets = await db
    .select({ id: spaceAssets.id })
    .from(spaceAssets)
    .where(
      and(
        eq(spaceAssets.organizationId, organizationId),
        sql`${spaceAssets.status} != 'DECOMMISSIONED'`,
      ),
    );

  const assetRisks = await Promise.all(
    orgAssets.map((a) => calculateAssetRisk(a.id)),
  );

  // Sort by risk score descending
  assetRisks.sort((a, b) => b.overall - a.overall);

  // Get history for trend chart (last 30 days, org-level)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const history = await db
    .select({
      score: riskScoresHistory.score,
      calculatedAt: riskScoresHistory.calculatedAt,
    })
    .from(riskScoresHistory)
    .where(
      and(
        eq(riskScoresHistory.organizationId, organizationId),
        isNull(riskScoresHistory.assetId),
        gte(riskScoresHistory.calculatedAt, thirtyDaysAgo),
      ),
    )
    .orderBy(riskScoresHistory.calculatedAt);

  return {
    organization: orgRisk,
    assets: assetRisks.map((ar) => ({
      assetId: ar.assetId,
      assetName: ar.assetName,
      assetType: ar.assetType,
      criticality: ar.criticality,
      risk: {
        overall: ar.overall,
        breakdown: ar.breakdown,
        trend: ar.trend,
        topRisks: ar.topRisks,
      },
    })),
    history: history.map((h) => ({
      date: h.calculatedAt.toISOString().slice(0, 10),
      score: h.score,
    })),
  };
}

// ---------------------------------------------------------------------------
// Store risk snapshot (called on-demand or daily)
// ---------------------------------------------------------------------------

export async function storeRiskSnapshot(organizationId: string): Promise<void> {
  const now = new Date();

  // Store org-level score
  const orgRisk = await calculateOrgRisk(organizationId);
  await db.insert(riskScoresHistory).values({
    organizationId,
    assetId: null,
    score: orgRisk.overall,
    breakdown: orgRisk.breakdown,
    calculatedAt: now,
  });

  // Store per-asset scores
  const orgAssets = await db
    .select({ id: spaceAssets.id })
    .from(spaceAssets)
    .where(
      and(
        eq(spaceAssets.organizationId, organizationId),
        sql`${spaceAssets.status} != 'DECOMMISSIONED'`,
      ),
    );

  for (const asset of orgAssets) {
    try {
      const risk = await calculateAssetRisk(asset.id);
      await db.insert(riskScoresHistory).values({
        organizationId,
        assetId: asset.id,
        score: risk.overall,
        breakdown: risk.breakdown,
        calculatedAt: now,
      });
    } catch (err) {
      // Log but continue: one failed asset snapshot shouldn't abort the entire batch
      console.error(`[risk] Failed to store snapshot for asset ${asset.id}:`, err instanceof Error ? err.message : err);
    }
  }
}
