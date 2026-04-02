/**
 * Alert Correlation Engine
 *
 * Automatically groups related alerts into incidents using four built-in
 * correlation rules:
 *
 *   1. Temporal Clustering   - >3 alerts from the same asset within 5 min
 *   2. Kill Chain Progression - alerts spanning multiple SPARTA tactics in sequence
 *   3. Cross-Asset Spread     - similar alerts across multiple assets in 30 min
 *   4. Anomaly + Rule Conv.   - ML anomaly + rule-based alert on same asset in 10 min
 *
 * Each rule can be toggled on/off and its thresholds adjusted via the
 * correlation_settings table (or runtime config fallback).
 */

import { eq, and, gte, inArray, desc } from "drizzle-orm";
import { db } from "../../db/client";
import { alerts } from "../../db/schema/alerts";
import { incidents, incidentAlerts } from "../../db/schema/incidents";
import type { AlertResponse } from "@spaceguard/shared";
import { IncidentSeverity, IncidentNis2Classification } from "@spaceguard/shared";
import type { SpartaTechniqueEntry, TimelineEntry } from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CorrelationResult {
  action: "created_incident" | "added_to_incident" | "no_correlation";
  incidentId?: string;
  correlationRule?: string;
}

export interface CorrelationRuleConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  thresholds: Record<string, number>;
}

// ---------------------------------------------------------------------------
// SPARTA kill-chain ordering (used by Rule 2)
// ---------------------------------------------------------------------------

const SPARTA_TACTIC_ORDER: Record<string, number> = {
  "Reconnaissance":   1,
  "Resource Development": 2,
  "Initial Access":   3,
  "Execution":        4,
  "Persistence":      5,
  "Privilege Escalation": 6,
  "Defense Evasion":  7,
  "Credential Access": 8,
  "Discovery":        9,
  "Lateral Movement": 10,
  "Collection":       11,
  "Command and Control": 12,
  "Exfiltration":     13,
  "Impact":           14,
};

// ---------------------------------------------------------------------------
// Default rule configurations
// In-memory defaults; the settings page can override these via API.
// ---------------------------------------------------------------------------

const DEFAULT_RULES: CorrelationRuleConfig[] = [
  {
    id: "CORR-TEMPORAL-CLUSTER",
    name: "Temporal Clustering",
    description: "Groups alerts from the same asset that fire within a short time window",
    enabled: true,
    thresholds: { alert_count: 3, window_minutes: 5 },
  },
  {
    id: "CORR-KILL-CHAIN",
    name: "Kill Chain Progression",
    description: "Detects alerts spanning multiple SPARTA tactics in attack-chain order",
    enabled: true,
    thresholds: { min_tactics: 2, window_minutes: 60 },
  },
  {
    id: "CORR-CROSS-ASSET",
    name: "Cross-Asset Spread",
    description: "Detects similar alerts appearing across multiple assets in the same organization",
    enabled: true,
    thresholds: { min_assets: 2, window_minutes: 30 },
  },
  {
    id: "CORR-ANOMALY-RULE",
    name: "Anomaly + Rule Convergence",
    description: "Correlates ML anomaly alerts with rule-based alerts on the same asset",
    enabled: true,
    thresholds: { window_minutes: 10 },
  },
];

// In-memory mutable config (overridden by settings API)
let ruleConfigs: CorrelationRuleConfig[] = DEFAULT_RULES.map((r) => ({ ...r, thresholds: { ...r.thresholds } }));

export function getCorrelationRules(): CorrelationRuleConfig[] {
  return ruleConfigs.map((r) => ({ ...r, thresholds: { ...r.thresholds } }));
}

export function updateCorrelationRule(
  ruleId: string,
  updates: { enabled?: boolean; thresholds?: Record<string, number> }
): CorrelationRuleConfig | null {
  const rule = ruleConfigs.find((r) => r.id === ruleId);
  if (!rule) return null;
  if (updates.enabled !== undefined) rule.enabled = updates.enabled;
  if (updates.thresholds) {
    for (const [k, v] of Object.entries(updates.thresholds)) {
      if (k in rule.thresholds) {
        rule.thresholds[k] = v;
      }
    }
  }
  return { ...rule, thresholds: { ...rule.thresholds } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<string, number> = {
  LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
};

function highestSeverity(severities: string[]): string {
  let max = "LOW";
  for (const s of severities) {
    if ((SEVERITY_ORDER[s] ?? 0) > (SEVERITY_ORDER[max] ?? 0)) max = s;
  }
  return max;
}

function correlationScore(matchStrength: number, maxPossible: number): number {
  return Math.min(1, Math.max(0, matchStrength / maxPossible));
}

interface RecentAlert {
  id: string;
  organizationId: string;
  ruleId: string;
  severity: string;
  affectedAssetId: string | null;
  spartaTactic: string | null;
  spartaTechnique: string | null;
  triggeredAt: Date;
  streamId: string | null;
  title: string;
}

async function fetchRecentAlerts(
  organizationId: string,
  windowMinutes: number,
  extraConditions?: ReturnType<typeof eq>[]
): Promise<RecentAlert[]> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const conditions = [
    eq(alerts.organizationId, organizationId),
    gte(alerts.triggeredAt, windowStart),
    inArray(alerts.status, ["NEW", "INVESTIGATING"]),
    ...(extraConditions ?? []),
  ];

  const rows = await db
    .select({
      id: alerts.id,
      organizationId: alerts.organizationId,
      ruleId: alerts.ruleId,
      severity: alerts.severity,
      affectedAssetId: alerts.affectedAssetId,
      spartaTactic: alerts.spartaTactic,
      spartaTechnique: alerts.spartaTechnique,
      triggeredAt: alerts.triggeredAt,
      streamId: alerts.streamId,
      title: alerts.title,
    })
    .from(alerts)
    .where(and(...conditions))
    .orderBy(desc(alerts.triggeredAt))
    .limit(200);

  return rows;
}

/**
 * Find an open incident that was auto-created by the correlation engine
 * for the given organization, matching a specific correlation rule.
 * Returns the incident ID if one exists and is still open, so we can
 * add alerts to it instead of creating a new one.
 */
async function findOpenCorrelatedIncident(
  organizationId: string,
  correlationRule: string,
  assetId?: string | null,
  withinMinutes = 30,
): Promise<string | null> {
  const windowStart = new Date(Date.now() - withinMinutes * 60 * 1000);
  const openStatuses = ["DETECTED", "TRIAGING", "INVESTIGATING", "CONTAINING"] as const;

  const conditions = [
    eq(incidents.organizationId, organizationId),
    inArray(incidents.status, [...openStatuses]),
    gte(incidents.createdAt, windowStart),
  ];

  const rows = await db
    .select({ id: incidents.id, timeline: incidents.timeline })
    .from(incidents)
    .where(and(...conditions))
    .orderBy(desc(incidents.createdAt))
    .limit(20);

  for (const row of rows) {
    const tl = (row.timeline as TimelineEntry[]) ?? [];
    const hasCorrelation = tl.some((e) =>
      e.event.includes(`[${correlationRule}]`)
    );
    if (hasCorrelation) return row.id;
  }

  return null;
}

async function createCorrelatedIncident(
  organizationId: string,
  title: string,
  description: string,
  severity: string,
  correlationRule: string,
  correlationScoreVal: number,
  alertIds: string[],
  spartaTechniques: SpartaTechniqueEntry[],
  affectedAssetIds: string[],
): Promise<string> {
  const now = new Date();

  const initialTimeline: TimelineEntry[] = [
    {
      timestamp: now.toISOString(),
      event: `Auto-created by correlation engine: [${correlationRule}]`,
      actor: "correlation-engine",
    },
  ];

  const [row] = await db
    .insert(incidents)
    .values({
      organizationId,
      title: `[CORRELATED] ${title}`,
      description,
      severity: severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      status: "DETECTED",
      nis2Classification: "NON_SIGNIFICANT",
      spartaTechniques,
      affectedAssetIds,
      timeline: initialTimeline,
      detectedAt: now,
      correlationRule,
      correlationScore: correlationScoreVal,
    })
    .returning();

  // Link all alerts to this incident
  for (const alertId of alertIds) {
    await db
      .insert(incidentAlerts)
      .values({ incidentId: row.id, alertId })
      .onConflictDoNothing()
      .execute();
  }

  return row.id;
}

async function addAlertToExistingIncident(
  incidentId: string,
  alertId: string,
  alertTitle: string,
): Promise<void> {
  await db
    .insert(incidentAlerts)
    .values({ incidentId, alertId })
    .onConflictDoNothing()
    .execute();

  // Append timeline entry
  const entry: TimelineEntry = {
    timestamp: new Date().toISOString(),
    event: `Alert added by correlation engine: ${alertTitle}`,
    actor: "correlation-engine",
  };

  // Import sql for atomic append
  const { sql } = await import("drizzle-orm");
  await db
    .update(incidents)
    .set({
      timeline: sql`${incidents.timeline} || ${JSON.stringify([entry])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(incidents.id, incidentId));
}

// ---------------------------------------------------------------------------
// Correlation rules
// ---------------------------------------------------------------------------

/**
 * Rule 1: Temporal Clustering
 * If >N alerts from the same asset within M minutes, group them.
 */
async function checkTemporalClustering(
  newAlert: AlertResponse,
): Promise<CorrelationResult> {
  const config = ruleConfigs.find((r) => r.id === "CORR-TEMPORAL-CLUSTER");
  if (!config?.enabled || !newAlert.affectedAssetId) return { action: "no_correlation" };

  const threshold = config.thresholds.alert_count ?? 3;
  const windowMin = config.thresholds.window_minutes ?? 5;

  const recent = await fetchRecentAlerts(
    newAlert.organizationId,
    windowMin,
    [eq(alerts.affectedAssetId, newAlert.affectedAssetId)],
  );

  // Include the new alert in the count
  if (recent.length < threshold) return { action: "no_correlation" };

  // Check if there's already an open correlated incident for this rule/asset
  const existingId = await findOpenCorrelatedIncident(
    newAlert.organizationId,
    config.id,
    newAlert.affectedAssetId,
    windowMin * 2,
  );

  if (existingId) {
    await addAlertToExistingIncident(existingId, newAlert.id, newAlert.title);
    return { action: "added_to_incident", incidentId: existingId, correlationRule: config.id };
  }

  // Create new incident
  const severities = recent.map((a) => a.severity);
  const incidentId = await createCorrelatedIncident(
    newAlert.organizationId,
    `Temporal Cluster: ${recent.length} alerts on asset`,
    `${recent.length} alerts fired on the same asset within ${windowMin} minutes. Rule IDs: ${[...new Set(recent.map((a) => a.ruleId))].join(", ")}`,
    highestSeverity(severities),
    config.id,
    correlationScore(recent.length, threshold * 2),
    recent.map((a) => a.id),
    [],
    newAlert.affectedAssetId ? [newAlert.affectedAssetId] : [],
  );

  return { action: "created_incident", incidentId, correlationRule: config.id };
}

/**
 * Rule 2: Kill Chain Progression
 * If alerts span multiple SPARTA tactics in attack-chain sequence.
 */
async function checkKillChainProgression(
  newAlert: AlertResponse,
): Promise<CorrelationResult> {
  const config = ruleConfigs.find((r) => r.id === "CORR-KILL-CHAIN");
  if (!config?.enabled || !newAlert.spartaTactic) return { action: "no_correlation" };

  const windowMin = config.thresholds.window_minutes ?? 60;
  const minTactics = config.thresholds.min_tactics ?? 2;

  const recent = await fetchRecentAlerts(
    newAlert.organizationId,
    windowMin,
  );

  // Collect unique tactics with their ordering
  const tacticSet = new Map<string, { order: number; alertIds: string[] }>();
  for (const a of recent) {
    if (!a.spartaTactic) continue;
    const order = SPARTA_TACTIC_ORDER[a.spartaTactic];
    if (order === undefined) continue;
    const entry = tacticSet.get(a.spartaTactic);
    if (entry) {
      entry.alertIds.push(a.id);
    } else {
      tacticSet.set(a.spartaTactic, { order, alertIds: [a.id] });
    }
  }

  if (tacticSet.size < minTactics) return { action: "no_correlation" };

  // Check for sequential progression (at least minTactics consecutive or near-consecutive)
  const sorted = [...tacticSet.entries()].sort((a, b) => a[1].order - b[1].order);
  let currentChain = 1;
  let currentStart = 0;
  let bestChain = 1;
  let bestStart = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][1].order - sorted[i - 1][1].order <= 2) {
      currentChain++;
    } else {
      if (currentChain > bestChain) {
        bestChain = currentChain;
        bestStart = currentStart;
      }
      currentStart = i;
      currentChain = 1;
    }
  }
  if (currentChain > bestChain) {
    bestChain = currentChain;
    bestStart = currentStart;
  }
  const longestChain = bestChain;
  const chainStart = bestStart;

  if (longestChain < minTactics) return { action: "no_correlation" };

  // Check if there's already an open kill-chain incident
  const existingId = await findOpenCorrelatedIncident(
    newAlert.organizationId,
    config.id,
    null,
    windowMin,
  );

  if (existingId) {
    await addAlertToExistingIncident(existingId, newAlert.id, newAlert.title);
    return { action: "added_to_incident", incidentId: existingId, correlationRule: config.id };
  }

  // Collect all alert IDs and SPARTA techniques in the chain
  const chainAlertIds: string[] = [];
  const techniques: SpartaTechniqueEntry[] = [];
  for (const [tactic, data] of sorted.slice(chainStart, chainStart + longestChain)) {
    chainAlertIds.push(...data.alertIds);
    const matchingAlerts = recent.filter((a) => a.spartaTactic === tactic && a.spartaTechnique);
    for (const ma of matchingAlerts) {
      techniques.push({ tactic, technique: ma.spartaTechnique! });
    }
  }

  const tacticNames = sorted.slice(chainStart, chainStart + longestChain).map(([t]) => t);

  const incidentId = await createCorrelatedIncident(
    newAlert.organizationId,
    `Potential Attack Chain: ${tacticNames.join(" -> ")}`,
    `Alerts detected spanning ${longestChain} SPARTA tactics in kill-chain sequence: ${tacticNames.join(", ")}. This may indicate a coordinated attack progressing through multiple phases.`,
    "HIGH",
    config.id,
    correlationScore(longestChain, Object.keys(SPARTA_TACTIC_ORDER).length),
    [...new Set(chainAlertIds)],
    techniques,
    [],
  );

  return { action: "created_incident", incidentId, correlationRule: config.id };
}

/**
 * Rule 3: Cross-Asset Spread
 * If similar alerts (same ruleId) appear across multiple assets within 30 min.
 */
async function checkCrossAssetSpread(
  newAlert: AlertResponse,
): Promise<CorrelationResult> {
  const config = ruleConfigs.find((r) => r.id === "CORR-CROSS-ASSET");
  if (!config?.enabled) return { action: "no_correlation" };

  const windowMin = config.thresholds.window_minutes ?? 30;
  const minAssets = config.thresholds.min_assets ?? 2;

  const recent = await fetchRecentAlerts(
    newAlert.organizationId,
    windowMin,
    [eq(alerts.ruleId, newAlert.ruleId)],
  );

  // Count unique affected assets
  const assetIds = new Set(recent.filter((a) => a.affectedAssetId).map((a) => a.affectedAssetId!));
  if (assetIds.size < minAssets) return { action: "no_correlation" };

  // Check for existing open incident
  const existingId = await findOpenCorrelatedIncident(
    newAlert.organizationId,
    config.id,
    null,
    windowMin,
  );

  if (existingId) {
    await addAlertToExistingIncident(existingId, newAlert.id, newAlert.title);
    return { action: "added_to_incident", incidentId: existingId, correlationRule: config.id };
  }

  const incidentId = await createCorrelatedIncident(
    newAlert.organizationId,
    `Multi-Asset Event: ${newAlert.ruleId} across ${assetIds.size} assets`,
    `Alert rule "${newAlert.ruleId}" fired across ${assetIds.size} different assets within ${windowMin} minutes. This may indicate a widespread event or common-cause failure.`,
    highestSeverity(recent.map((a) => a.severity)),
    config.id,
    correlationScore(assetIds.size, minAssets * 3),
    recent.map((a) => a.id),
    [],
    [...assetIds],
  );

  return { action: "created_incident", incidentId, correlationRule: config.id };
}

/**
 * Rule 4: Anomaly + Rule Convergence
 * If an ML anomaly alert AND a rule-based alert fire on the same asset within 10 min.
 */
async function checkAnomalyRuleConvergence(
  newAlert: AlertResponse,
): Promise<CorrelationResult> {
  const config = ruleConfigs.find((r) => r.id === "CORR-ANOMALY-RULE");
  if (!config?.enabled || !newAlert.affectedAssetId) return { action: "no_correlation" };

  const windowMin = config.thresholds.window_minutes ?? 10;
  const isMLAlert = newAlert.ruleId.startsWith("ML-");

  const recent = await fetchRecentAlerts(
    newAlert.organizationId,
    windowMin,
    [eq(alerts.affectedAssetId, newAlert.affectedAssetId)],
  );

  // We need both ML and non-ML alerts on the same asset
  const mlAlerts = recent.filter((a) => a.ruleId.startsWith("ML-"));
  const ruleAlerts = recent.filter((a) => !a.ruleId.startsWith("ML-"));

  if (mlAlerts.length === 0 || ruleAlerts.length === 0) return { action: "no_correlation" };

  // Check for existing open incident
  const existingId = await findOpenCorrelatedIncident(
    newAlert.organizationId,
    config.id,
    newAlert.affectedAssetId,
    windowMin * 2,
  );

  if (existingId) {
    await addAlertToExistingIncident(existingId, newAlert.id, newAlert.title);
    return { action: "added_to_incident", incidentId: existingId, correlationRule: config.id };
  }

  // Elevate severity: take the highest and bump up one level if not already CRITICAL
  const allSeverities = recent.map((a) => a.severity);
  let sev = highestSeverity(allSeverities);
  if (sev === "LOW") sev = "MEDIUM";
  else if (sev === "MEDIUM") sev = "HIGH";
  else if (sev === "HIGH") sev = "CRITICAL";

  const allAlertIds = [...new Set([...mlAlerts.map((a) => a.id), ...ruleAlerts.map((a) => a.id)])];

  const incidentId = await createCorrelatedIncident(
    newAlert.organizationId,
    `Confirmed Anomaly: ML + rule-based detection convergence`,
    `Both ML anomaly detection and rule-based detection fired on the same asset within ${windowMin} minutes. ML alerts: ${mlAlerts.map((a) => a.ruleId).join(", ")}. Rule alerts: ${ruleAlerts.map((a) => a.ruleId).join(", ")}. Severity elevated due to convergence.`,
    sev,
    config.id,
    0.85, // High confidence when both detection methods agree
    allAlertIds,
    [],
    newAlert.affectedAssetId ? [newAlert.affectedAssetId] : [],
  );

  return { action: "created_incident", incidentId, correlationRule: config.id };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Correlate a newly created alert against all enabled correlation rules.
 * Returns the first rule that matches (rules are checked in priority order).
 */
export async function correlateAlert(
  newAlert: AlertResponse,
): Promise<CorrelationResult> {
  try {
    // Rule 4 first: most specific (both detection types must converge)
    const r4 = await checkAnomalyRuleConvergence(newAlert);
    if (r4.action !== "no_correlation") return r4;

    // Rule 2: Kill chain progression
    const r2 = await checkKillChainProgression(newAlert);
    if (r2.action !== "no_correlation") return r2;

    // Rule 3: Cross-asset spread
    const r3 = await checkCrossAssetSpread(newAlert);
    if (r3.action !== "no_correlation") return r3;

    // Rule 1: Temporal clustering (most generic, checked last)
    const r1 = await checkTemporalClustering(newAlert);
    if (r1.action !== "no_correlation") return r1;

    return { action: "no_correlation" };
  } catch (err) {
    console.error("[correlator] Error during correlation:", err);
    return { action: "no_correlation" };
  }
}
