/**
 * Statistical Anomaly Detection for Telemetry Parameters
 *
 * Phase 1: Rolling z-score based detection.
 *
 * For each (stream_id, parameter_name) pair, maintains a 24-hour rolling
 * baseline (mean, std deviation, min, max, sample count). When a new
 * numeric point arrives:
 *
 *   z = (value - mean) / std_deviation
 *
 * If |z| > threshold (default 3.0), the point is flagged as anomalous.
 * Severity is mapped from z-score magnitude:
 *   |z| > 5.0  -> CRITICAL
 *   |z| > 4.0  -> HIGH
 *   |z| > 3.0  -> MEDIUM
 *
 * A "learning mode" concept suppresses alert generation for newly created
 * streams: during the first 24 hours the detector only builds baselines.
 *
 * Baselines are stored in the `telemetry_baselines` table and updated
 * incrementally using Welford's online algorithm for numerical stability.
 */

import { db } from "../../db/client";
import { telemetryBaselines } from "../../db/schema/baselines";
import { telemetryStreams } from "../../db/schema/telemetry";
import { eq, and } from "drizzle-orm";
import { AlertSeverity } from "@spaceguard/shared";
import type { CreateAlert } from "@spaceguard/shared";
import { HTTPException } from "hono/http-exception";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default z-score threshold for anomaly flagging */
const DEFAULT_Z_THRESHOLD = 3.0;

/** Minimum sample count before anomaly detection activates */
const MIN_SAMPLES = 30;

/** Rolling window duration (24 hours in ms) */
const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;

/** Rule ID for ML anomaly alerts */
const ML_ANOMALY_RULE_ID = "ML-ANOMALY-001";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BaselineStats {
  mean: number;
  stdDeviation: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
  windowStart: Date;
  windowEnd: Date;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  zScore: number;
  baseline: BaselineStats;
  confidence: number;
}

export interface AnomalyStats {
  streamId: string;
  totalBaselines: number;
  anomalyRate: number;
  topAnomalousParameters: Array<{
    parameterName: string;
    anomalyCount: number;
    lastZScore: number;
  }>;
  learningMode: boolean;
  learningModeUntil: Date | null;
}

// ---------------------------------------------------------------------------
// In-memory running state (Welford's online algorithm)
// ---------------------------------------------------------------------------

interface RunningState {
  count: number;
  mean: number;
  m2: number; // Sum of squared differences from the mean
  min: number;
  max: number;
  windowStart: number; // unix ms
  /** Track recent anomaly detections for stats */
  recentAnomalyCount: number;
  lastZScore: number;
}

/**
 * In-memory running statistics per (streamId, parameterName).
 * Persisted to the baselines table periodically.
 */
const runningStats = new Map<string, RunningState>();

/** How many updates between DB persists */
const PERSIST_INTERVAL = 10;

/** Tracks update counts per key for periodic persistence */
const updateCounts = new Map<string, number>();

function stateKey(streamId: string, parameterName: string): string {
  return `${streamId}::${parameterName}`;
}

// ---------------------------------------------------------------------------
// Welford's online algorithm helpers
// ---------------------------------------------------------------------------

function newRunningState(): RunningState {
  return {
    count: 0,
    mean: 0,
    m2: 0,
    min: Infinity,
    max: -Infinity,
    windowStart: Date.now(),
    recentAnomalyCount: 0,
    lastZScore: 0,
  };
}

function updateWelford(state: RunningState, value: number): void {
  state.count += 1;
  const delta = value - state.mean;
  state.mean += delta / state.count;
  const delta2 = value - state.mean;
  state.m2 += delta * delta2;

  if (value < state.min) state.min = value;
  if (value > state.max) state.max = value;
}

function getStdDeviation(state: RunningState): number {
  if (state.count < 2) return 0;
  return Math.sqrt(state.m2 / (state.count - 1)); // Sample std deviation
}

// ---------------------------------------------------------------------------
// Window reset: if the window has expired, decay the stats
// ---------------------------------------------------------------------------

function maybeResetWindow(state: RunningState, nowMs: number): void {
  const windowAge = nowMs - state.windowStart;
  if (windowAge > WINDOW_DURATION_MS && state.count > MIN_SAMPLES) {
    // Decay: halve the sample count and M2 to gradually forget old data
    // while preserving the general trend. This is a lightweight approximation
    // of a proper sliding window without storing individual samples.
    state.count = Math.floor(state.count / 2);
    state.m2 = state.m2 / 2;
    state.windowStart = nowMs;
    state.recentAnomalyCount = Math.floor(state.recentAnomalyCount / 2);
  }
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Updates the rolling baseline for a (streamId, parameterName) pair and
 * returns anomaly detection results.
 *
 * This is the main entry point called from the ingestion path.
 */
export function updateBaselineAndDetect(
  streamId: string,
  parameterName: string,
  value: number,
  timestamp: Date
): AnomalyResult {
  const key = stateKey(streamId, parameterName);
  let state = runningStats.get(key);

  if (!state) {
    state = newRunningState();
    state.windowStart = timestamp.getTime();
    runningStats.set(key, state);
  }

  const nowMs = timestamp.getTime();
  maybeResetWindow(state, nowMs);

  // Calculate z-score BEFORE updating (against the existing baseline)
  const stdDev = getStdDeviation(state);
  let zScore = 0;
  let isAnomaly = false;
  let confidence = 0;

  if (state.count >= MIN_SAMPLES && stdDev > 0) {
    zScore = (value - state.mean) / stdDev;
    const absZ = Math.abs(zScore);
    isAnomaly = absZ > DEFAULT_Z_THRESHOLD;

    // Confidence scales from 0 at MIN_SAMPLES to 1.0 at 200+ samples
    confidence = Math.min(1.0, (state.count - MIN_SAMPLES) / (200 - MIN_SAMPLES));

    if (isAnomaly) {
      state.recentAnomalyCount += 1;
      state.lastZScore = zScore;
    }
  }

  // Update the running statistics with the new value
  updateWelford(state, value);

  // Persist to DB periodically
  const cnt = (updateCounts.get(key) ?? 0) + 1;
  updateCounts.set(key, cnt);
  if (cnt >= PERSIST_INTERVAL) {
    updateCounts.set(key, 0);
    persistBaseline(streamId, parameterName, state).catch((err: unknown) => {
      console.error("[anomaly] Failed to persist baseline:", err);
    });
  }

  const baseline: BaselineStats = {
    mean: state.mean,
    stdDeviation: stdDev,
    minValue: state.min === Infinity ? value : state.min,
    maxValue: state.max === -Infinity ? value : state.max,
    sampleCount: state.count,
    windowStart: new Date(state.windowStart),
    windowEnd: timestamp,
  };

  return { isAnomaly, zScore, baseline, confidence };
}

/**
 * Checks whether a stream is still in learning mode.
 * During learning mode, baselines are built but no alerts are generated.
 */
export async function isInLearningMode(streamId: string): Promise<boolean> {
  const [stream] = await db
    .select({ learningModeUntil: telemetryStreams.learningModeUntil })
    .from(telemetryStreams)
    .where(eq(telemetryStreams.id, streamId))
    .limit(1);

  if (!stream || !stream.learningModeUntil) return false;
  return stream.learningModeUntil.getTime() > Date.now();
}

/**
 * Maps z-score magnitude to alert severity.
 */
export function zScoreToSeverity(zScore: number): AlertSeverity {
  const absZ = Math.abs(zScore);
  if (absZ > 5.0) return AlertSeverity.CRITICAL;
  if (absZ > 4.0) return AlertSeverity.HIGH;
  return AlertSeverity.MEDIUM;
}

/**
 * Builds a CreateAlert payload for an ML anomaly detection.
 */
export function buildAnomalyAlert(
  streamId: string,
  organizationId: string,
  assetId: string,
  parameterName: string,
  value: number,
  result: AnomalyResult
): CreateAlert {
  const severity = zScoreToSeverity(result.zScore);
  const expectedMin = result.baseline.mean - DEFAULT_Z_THRESHOLD * result.baseline.stdDeviation;
  const expectedMax = result.baseline.mean + DEFAULT_Z_THRESHOLD * result.baseline.stdDeviation;

  return {
    organizationId,
    streamId,
    ruleId: ML_ANOMALY_RULE_ID,
    severity,
    title: `Anomalous ${parameterName} value detected`,
    description:
      `Parameter "${parameterName}" value ${value.toFixed(4)} deviates significantly ` +
      `from baseline (z-score: ${result.zScore.toFixed(2)}, ` +
      `expected range: ${expectedMin.toFixed(2)} to ${expectedMax.toFixed(2)}). ` +
      `Baseline: mean=${result.baseline.mean.toFixed(4)}, ` +
      `stddev=${result.baseline.stdDeviation.toFixed(4)}, ` +
      `samples=${result.baseline.sampleCount}.`,
    spartaTactic: "Impact",
    spartaTechnique: "Degradation",
    affectedAssetId: assetId,
    triggeredAt: new Date().toISOString(),
    metadata: {
      detectionType: "statistical_anomaly",
      parameterName,
      value,
      zScore: result.zScore,
      confidence: result.confidence,
      baselineMean: result.baseline.mean,
      baselineStdDev: result.baseline.stdDeviation,
      baselineMin: result.baseline.minValue,
      baselineMax: result.baseline.maxValue,
      baselineSamples: result.baseline.sampleCount,
      expectedRange: { min: expectedMin, max: expectedMax },
      threshold: DEFAULT_Z_THRESHOLD,
    },
  };
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

/**
 * Look up the streamId that owns a baseline (for tenant validation).
 */
export async function getBaselineStreamId(baselineId: string): Promise<string> {
  const [row] = await db
    .select({ streamId: telemetryBaselines.streamId })
    .from(telemetryBaselines)
    .where(eq(telemetryBaselines.id, baselineId))
    .limit(1);
  if (!row) {
    throw new HTTPException(404, { message: `Baseline ${baselineId} not found` });
  }
  return row.streamId;
}

/**
 * Returns all baselines for a given stream (from DB).
 */
export async function getBaselines(
  streamId: string
): Promise<Array<{
  id: string;
  streamId: string;
  parameterName: string;
  mean: number;
  stdDeviation: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
  windowStart: string;
  windowEnd: string;
  updatedAt: string;
}>> {
  const rows = await db
    .select()
    .from(telemetryBaselines)
    .where(eq(telemetryBaselines.streamId, streamId));

  return rows.map((r) => ({
    id: r.id,
    streamId: r.streamId,
    parameterName: r.parameterName,
    mean: r.mean,
    stdDeviation: r.stdDeviation,
    minValue: r.minValue,
    maxValue: r.maxValue,
    sampleCount: r.sampleCount,
    windowStart: r.windowStart.toISOString(),
    windowEnd: r.windowEnd.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * Manually update a baseline (operator override when they know the normal range).
 */
export async function updateBaselineManual(
  baselineId: string,
  updates: {
    mean?: number;
    stdDeviation?: number;
    minValue?: number;
    maxValue?: number;
  }
): Promise<{
  id: string;
  streamId: string;
  parameterName: string;
  mean: number;
  stdDeviation: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
  windowStart: string;
  windowEnd: string;
  updatedAt: string;
}> {
  const [row] = await db
    .update(telemetryBaselines)
    .set({
      ...(updates.mean !== undefined ? { mean: updates.mean } : {}),
      ...(updates.stdDeviation !== undefined ? { stdDeviation: updates.stdDeviation } : {}),
      ...(updates.minValue !== undefined ? { minValue: updates.minValue } : {}),
      ...(updates.maxValue !== undefined ? { maxValue: updates.maxValue } : {}),
      updatedAt: new Date(),
    })
    .where(eq(telemetryBaselines.id, baselineId))
    .returning();

  if (!row) {
    throw new HTTPException(404, { message: `Baseline ${baselineId} not found` });
  }

  // Also update in-memory state if it exists
  const key = stateKey(row.streamId, row.parameterName);
  const state = runningStats.get(key);
  if (state) {
    if (updates.mean !== undefined) state.mean = updates.mean;
    if (updates.minValue !== undefined) state.min = updates.minValue;
    if (updates.maxValue !== undefined) state.max = updates.maxValue;
    // Recalculate m2 from new stdDeviation if provided
    if (updates.stdDeviation !== undefined && state.count > 1) {
      state.m2 = updates.stdDeviation * updates.stdDeviation * (state.count - 1);
    }
  }

  return {
    id: row.id,
    streamId: row.streamId,
    parameterName: row.parameterName,
    mean: row.mean,
    stdDeviation: row.stdDeviation,
    minValue: row.minValue,
    maxValue: row.maxValue,
    sampleCount: row.sampleCount,
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Returns anomaly detection statistics for a stream.
 */
export async function getAnomalyStats(streamId: string): Promise<AnomalyStats> {
  // Get learning mode status
  const [stream] = await db
    .select({ learningModeUntil: telemetryStreams.learningModeUntil })
    .from(telemetryStreams)
    .where(eq(telemetryStreams.id, streamId))
    .limit(1);

  if (!stream) {
    const { HTTPException } = await import("hono/http-exception");
    throw new HTTPException(404, { message: `Stream ${streamId} not found` });
  }

  const learningMode = stream.learningModeUntil
    ? stream.learningModeUntil.getTime() > Date.now()
    : false;

  // Get baselines from DB
  const baselines = await db
    .select()
    .from(telemetryBaselines)
    .where(eq(telemetryBaselines.streamId, streamId));

  // Collect in-memory anomaly data
  const topAnomalous: AnomalyStats["topAnomalousParameters"] = [];
  let totalAnomalies = 0;
  let totalSamples = 0;

  for (const bl of baselines) {
    const key = stateKey(streamId, bl.parameterName);
    const state = runningStats.get(key);
    const anomalyCount = state?.recentAnomalyCount ?? 0;
    const lastZ = state?.lastZScore ?? 0;
    totalAnomalies += anomalyCount;
    totalSamples += bl.sampleCount;

    if (anomalyCount > 0) {
      topAnomalous.push({
        parameterName: bl.parameterName,
        anomalyCount,
        lastZScore: lastZ,
      });
    }
  }

  // Sort by anomaly count descending, take top 10
  topAnomalous.sort((a, b) => b.anomalyCount - a.anomalyCount);

  return {
    streamId,
    totalBaselines: baselines.length,
    anomalyRate: totalSamples > 0 ? totalAnomalies / totalSamples : 0,
    topAnomalousParameters: topAnomalous.slice(0, 10),
    learningMode,
    learningModeUntil: stream.learningModeUntil,
  };
}

// ---------------------------------------------------------------------------
// Persistence (async, fire-and-forget from the hot path)
// ---------------------------------------------------------------------------

async function persistBaseline(
  streamId: string,
  parameterName: string,
  state: RunningState
): Promise<void> {
  const stdDev = getStdDeviation(state);
  const now = new Date();

  await db
    .insert(telemetryBaselines)
    .values({
      streamId,
      parameterName,
      windowStart: new Date(state.windowStart),
      windowEnd: now,
      mean: state.mean,
      stdDeviation: stdDev,
      minValue: state.min === Infinity ? 0 : state.min,
      maxValue: state.max === -Infinity ? 0 : state.max,
      sampleCount: state.count,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [telemetryBaselines.streamId, telemetryBaselines.parameterName],
      set: {
        windowEnd: now,
        mean: state.mean,
        stdDeviation: stdDev,
        minValue: state.min === Infinity ? 0 : state.min,
        maxValue: state.max === -Infinity ? 0 : state.max,
        sampleCount: state.count,
        updatedAt: now,
      },
    });
}
