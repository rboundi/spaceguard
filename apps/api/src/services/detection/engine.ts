/**
 * Detection Engine
 *
 * Evaluates loaded YAML detection rules against incoming telemetry points.
 * Maintains in-memory per-stream state to track:
 *   - threshold breach start times (for duration-gated rules)
 *   - last seen values + timestamps (for rate-of-change rules)
 *   - last seen telemetry timestamp per stream (for absence rules)
 *
 * The engine is stateless across process restarts: if the process is restarted
 * the in-memory counters reset and duration conditions start fresh. This is
 * acceptable for the current phase; a future enhancement could seed state from
 * recent DB rows on startup.
 *
 * Usage:
 *   evaluatePoint(streamId, organizationId, assetId, point)
 *     -> returns array of CreateAlert payloads (may be empty)
 */

import { loadRulesMap } from "./rule-loader";
import type {
  DetectionRule,
  ThresholdCondition,
  RateOfChangeCondition,
  AbsenceCondition,
} from "./rule-loader";
import { AlertSeverity } from "@spaceguard/shared";
import type { CreateAlert } from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Module-level rule cache
// ---------------------------------------------------------------------------

/**
 * Cached rules map - loaded once at startup and reused on every evaluatePoint
 * call to avoid repeated filesystem reads per telemetry point.
 */
let cachedRulesMap: Map<string, DetectionRule> | null = null;

function getRulesMap(): Map<string, DetectionRule> {
  if (!cachedRulesMap) {
    cachedRulesMap = loadRulesMap();
  }
  return cachedRulesMap;
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface ThresholdState {
  /** Unix ms when the breach first started; null = not currently breaching */
  breachStartMs: number | null;
  /**
   * True once the alert has fired for this breach event.
   * Prevents flooding repeated alerts on every subsequent breaching point.
   * Reset to false when the condition clears.
   */
  fired: boolean;
}

interface RateOfChangeState {
  /** Previous numeric value for this parameter */
  lastValue: number;
  /** Unix ms when lastValue was recorded */
  lastTimeMs: number;
  /** Unix ms when the rate-of-change breach started; null = not currently breaching */
  breachStartMs: number | null;
  /**
   * True once the alert has fired for this breach event.
   * Reset to false when the condition clears.
   */
  fired: boolean;
}

interface AbsenceState {
  /** Unix ms of the most recent telemetry point for this stream */
  lastSeenMs: number;
  /** Unix ms when absence was first detected; null = stream is not absent */
  absenceStartMs: number | null;
  /**
   * True once the alert has fired for this absence event.
   * Prevents re-firing on every ticker call while the stream stays silent.
   * Reset to false when the stream comes back online.
   */
  fired: boolean;
}

// Keyed by streamId -> parameterName -> state
const thresholdState = new Map<string, Map<string, ThresholdState>>();
const rateOfChangeState = new Map<string, Map<string, RateOfChangeState>>();
// Keyed by streamId -> absenceState
const absenceState = new Map<string, AbsenceState>();

function getThresholdState(streamId: string, param: string): ThresholdState {
  let byStream = thresholdState.get(streamId);
  if (!byStream) {
    byStream = new Map();
    thresholdState.set(streamId, byStream);
  }
  let st = byStream.get(param);
  if (!st) {
    st = { breachStartMs: null, fired: false };
    byStream.set(param, st);
  }
  return st;
}

function getRateState(streamId: string, param: string): RateOfChangeState | undefined {
  return rateOfChangeState.get(streamId)?.get(param);
}

function setRateState(streamId: string, param: string, st: RateOfChangeState): void {
  let byStream = rateOfChangeState.get(streamId);
  if (!byStream) {
    byStream = new Map();
    rateOfChangeState.set(streamId, byStream);
  }
  byStream.set(param, st);
}

function getAbsenceState(streamId: string): AbsenceState {
  let st = absenceState.get(streamId);
  if (!st) {
    st = { lastSeenMs: Date.now(), absenceStartMs: null, fired: false };
    absenceState.set(streamId, st);
  }
  return st;
}

// ---------------------------------------------------------------------------
// Condition evaluators
// ---------------------------------------------------------------------------

function compare(value: number, operator: ThresholdCondition["operator"], threshold: number): boolean {
  switch (operator) {
    case "lt":  return value < threshold;
    case "lte": return value <= threshold;
    case "gt":  return value > threshold;
    case "gte": return value >= threshold;
    case "eq":  return value === threshold;
    case "neq": return value !== threshold;
  }
}

/**
 * Evaluates a threshold condition.
 * Returns true if the condition has been breaching for at least duration_seconds.
 */
function evalThreshold(
  streamId: string,
  param: string,
  value: number,
  nowMs: number,
  cond: ThresholdCondition
): boolean {
  const breaching = compare(value, cond.operator, cond.value);
  const st = getThresholdState(streamId, param);

  if (breaching) {
    if (st.breachStartMs === null) {
      st.breachStartMs = nowMs;
    }
    const durationRequired = (cond.duration_seconds ?? 0) * 1000;
    const durationMet = (nowMs - st.breachStartMs) >= durationRequired;
    if (durationMet && !st.fired) {
      st.fired = true;
      return true;
    }
    return false;
  } else {
    // Condition cleared - reset so the next breach fires again
    st.breachStartMs = null;
    st.fired = false;
    return false;
  }
}

/**
 * Evaluates a rate_of_change condition.
 * Returns true if |delta_per_second| >= max_change_per_second for duration.
 */
function evalRateOfChange(
  streamId: string,
  param: string,
  value: number,
  nowMs: number,
  cond: RateOfChangeCondition
): boolean {
  const prev = getRateState(streamId, param);

  if (!prev) {
    // First data point - no rate can be calculated yet
    setRateState(streamId, param, { lastValue: value, lastTimeMs: nowMs, breachStartMs: null, fired: false });
    return false;
  }

  const dtSeconds = (nowMs - prev.lastTimeMs) / 1000;

  let exceeds = false;
  if (dtSeconds > 0) {
    const ratePerSecond = Math.abs((value - prev.lastValue) / dtSeconds);
    exceeds = ratePerSecond >= cond.max_change_per_second;
  }

  if (exceeds) {
    if (prev.breachStartMs === null) {
      prev.breachStartMs = nowMs;
    }
    const durationRequired = (cond.duration_seconds ?? 0) * 1000;
    const durationMet = (nowMs - prev.breachStartMs) >= durationRequired;
    prev.lastValue = value;
    prev.lastTimeMs = nowMs;
    if (durationMet && !prev.fired) {
      prev.fired = true;
      return true;
    }
    return false;
  } else {
    // Condition cleared - reset so the next breach fires again
    prev.breachStartMs = null;
    prev.fired = false;
    prev.lastValue = value;
    prev.lastTimeMs = nowMs;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Absence check (called separately, not per-point)
// ---------------------------------------------------------------------------

/**
 * Updates the last-seen timestamp for a stream.
 * Called whenever any telemetry point arrives for the stream.
 */
export function touchStream(streamId: string): void {
  const st = getAbsenceState(streamId);
  st.lastSeenMs = Date.now();
  st.absenceStartMs = null; // stream is alive again
  st.fired = false;          // allow the next absence event to fire
}

/**
 * Checks all absence rules against registered streams.
 * Returns CreateAlert payloads for any streams that have gone silent.
 *
 * Should be called on a periodic ticker (e.g. every 10s).
 */
export function checkAbsenceRules(
  streams: Array<{ streamId: string; organizationId: string; assetId: string }>
): CreateAlert[] {
  const rules = getRulesMap();
  const nowMs = Date.now();
  const triggered: CreateAlert[] = [];

  for (const { streamId, organizationId, assetId } of streams) {
    const st = getAbsenceState(streamId);

    for (const rule of rules.values()) {
      if (rule.condition.type !== "absence") continue;
      const cond = rule.condition as AbsenceCondition;
      const gapMs = cond.max_gap_seconds * 1000;
      const silentFor = nowMs - st.lastSeenMs;

      if (silentFor >= gapMs) {
        if (st.absenceStartMs === null) {
          st.absenceStartMs = nowMs;
        }
        // Only fire once per absence event - same fired-flag pattern as threshold/rate
        if (!st.fired) {
          st.fired = true;
          triggered.push(
            buildAlert(rule, streamId, organizationId, assetId, {
              silentForMs: silentFor,
              maxGapSeconds: cond.max_gap_seconds,
            })
          );
        }
      } else {
        st.absenceStartMs = null;
        st.fired = false;
      }
    }
  }

  return triggered;
}

// ---------------------------------------------------------------------------
// Alert payload builder
// ---------------------------------------------------------------------------

function buildAlert(
  rule: DetectionRule,
  streamId: string,
  organizationId: string,
  assetId: string,
  metadata: Record<string, unknown>
): CreateAlert {
  return {
    organizationId,
    streamId,
    ruleId: rule.id,
    severity: rule.severity as AlertSeverity,
    title: rule.name,
    description: rule.description,
    spartaTactic: rule.sparta?.tactic,
    spartaTechnique: rule.sparta?.technique,
    affectedAssetId: assetId,
    triggeredAt: new Date().toISOString(),
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Public API: evaluate a single telemetry point against all loaded rules
// ---------------------------------------------------------------------------

export interface TelemetryPointInput {
  parameterName: string;
  valueNumeric: number | null;
  valueText: string | null;
  /** ISO 8601 string */
  time: string;
}

/**
 * Evaluates all loaded detection rules against one incoming telemetry point.
 *
 * Updates in-memory state and returns a (possibly empty) array of alert
 * payloads for rules that fired. The caller (alert.service) is responsible
 * for deduplication and DB insertion.
 *
 * Absence rules are NOT evaluated here - they run on a periodic ticker.
 * Threshold and rate_of_change rules are evaluated here.
 */
export function evaluatePoint(
  streamId: string,
  organizationId: string,
  assetId: string,
  point: TelemetryPointInput
): CreateAlert[] {
  // Update absence state whenever we see any point
  touchStream(streamId);

  // Only numeric values are evaluable by threshold/rate rules
  if (point.valueNumeric === null) return [];

  const rules = getRulesMap();
  const nowMs = new Date(point.time).getTime() || Date.now();
  const value = point.valueNumeric;
  const param = point.parameterName;
  const triggered: CreateAlert[] = [];

  for (const rule of rules.values()) {
    const cond = rule.condition;

    if (cond.type === "absence") continue; // handled by ticker

    if (cond.type === "threshold") {
      if (cond.parameter !== param) continue;
      const fires = evalThreshold(streamId, param, value, nowMs, cond);
      if (fires) {
        triggered.push(
          buildAlert(rule, streamId, organizationId, assetId, {
            parameter: param,
            value,
            threshold: cond.value,
            operator: cond.operator,
            durationSeconds: cond.duration_seconds,
          })
        );
      }
    } else if (cond.type === "rate_of_change") {
      if (cond.parameter !== param) continue;
      const fires = evalRateOfChange(streamId, param, value, nowMs, cond);
      if (fires) {
        triggered.push(
          buildAlert(rule, streamId, organizationId, assetId, {
            parameter: param,
            value,
            maxChangePerSecond: cond.max_change_per_second,
            durationSeconds: cond.duration_seconds,
          })
        );
      }
    }
  }

  return triggered;
}
