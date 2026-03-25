/**
 * Detection Rule Loader
 *
 * Reads all YAML files from the `detection/rules/` directory (relative to the
 * repo root), parses them, validates their structure, and returns a flat array
 * of typed DetectionRule objects ready for use by the detection engine.
 *
 * Rules files follow the format defined in detection/rules/telemetry-anomalies.yaml.
 * Multiple files are supported; every *.yaml file in the directory is loaded.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load as yamlLoad } from "js-yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConditionOperator = "lt" | "lte" | "gt" | "gte" | "eq" | "neq";

export interface ThresholdCondition {
  type: "threshold";
  /** The telemetry parameterName to evaluate */
  parameter: string;
  operator: ConditionOperator;
  value: number;
  /** Minimum consecutive seconds the condition must hold before firing */
  duration_seconds?: number;
}

export interface RateOfChangeCondition {
  type: "rate_of_change";
  parameter: string;
  /** Alert if |delta| per second exceeds this value */
  max_change_per_second: number;
  duration_seconds?: number;
}

export interface AbsenceCondition {
  type: "absence";
  /** Fire if no telemetry points arrive for this many consecutive seconds */
  max_gap_seconds: number;
}

export type RuleCondition =
  | ThresholdCondition
  | RateOfChangeCondition
  | AbsenceCondition;

export interface SpartaMapping {
  tactic: string;
  technique: string;
}

export interface MitreMapping {
  /** MITRE ATT&CK technique ID, e.g. "T1190" */
  techniqueId: string;
  /** Human-readable technique name */
  techniqueName: string;
}

export interface DetectionRule {
  /** Unique identifier, e.g. "SG-TM-001" */
  id: string;
  /** Human-readable title - used as the alert title */
  name: string;
  /** Detailed explanation - used as the alert description */
  description: string;
  /** Alert severity when this rule fires */
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Optional SPARTA ATT&CK for Space mapping */
  sparta?: SpartaMapping;
  /** Optional MITRE ATT&CK mapping */
  mitre?: MitreMapping;
  /** Optional NIS2 Article 21 section references */
  nis2Articles?: string[];
  /** Source YAML filename */
  sourceFile?: string;
  /** Evaluation logic */
  condition: RuleCondition;
  /** Rule actions. Currently only "alert" is implemented; others are metadata. */
  actions: Array<string | Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

// Works in both tsx (ESM with real __dirname) and compiled dist (same).
// The detection/rules directory is at <repo-root>/detection/rules.
// This file is at <repo-root>/apps/api/src/services/detection/rule-loader.ts.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RULES_DIR = join(__dirname, "../../../../../detection/rules");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Validates that a raw YAML value is a valid ConditionOperator. */
function isOperator(v: unknown): v is ConditionOperator {
  return (
    typeof v === "string" &&
    ["lt", "lte", "gt", "gte", "eq", "neq"].includes(v)
  );
}

/** Validates that a raw YAML value is a valid severity string. */
function isSeverity(
  v: unknown
): v is "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  return (
    typeof v === "string" &&
    ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(v)
  );
}

/** Parses and validates a single raw rule object from YAML. Throws on invalid. */
function parseRule(raw: unknown, source: string): DetectionRule {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${source}: rule must be an object`);
  }

  const r = raw as Record<string, unknown>;

  if (typeof r.id !== "string" || !r.id.trim()) {
    throw new Error(`${source}: rule missing required string field 'id'`);
  }
  if (typeof r.name !== "string" || !r.name.trim()) {
    throw new Error(`${source}[${r.id}]: missing required string field 'name'`);
  }
  if (typeof r.description !== "string" || !r.description.trim()) {
    throw new Error(`${source}[${r.id}]: missing required string field 'description'`);
  }
  if (!isSeverity(r.severity)) {
    throw new Error(
      `${source}[${r.id}]: 'severity' must be LOW, MEDIUM, HIGH, or CRITICAL`
    );
  }

  // Validate condition
  if (typeof r.condition !== "object" || r.condition === null) {
    throw new Error(`${source}[${r.id}]: missing 'condition' object`);
  }
  const cond = r.condition as Record<string, unknown>;

  let condition: RuleCondition;

  if (cond.type === "threshold") {
    if (typeof cond.parameter !== "string" || !cond.parameter) {
      throw new Error(`${source}[${r.id}]: threshold condition missing 'parameter'`);
    }
    if (!isOperator(cond.operator)) {
      throw new Error(`${source}[${r.id}]: threshold condition 'operator' must be lt/lte/gt/gte/eq/neq`);
    }
    if (typeof cond.value !== "number") {
      throw new Error(`${source}[${r.id}]: threshold condition 'value' must be a number`);
    }
    condition = {
      type: "threshold",
      parameter: cond.parameter,
      operator: cond.operator,
      value: cond.value,
      duration_seconds:
        typeof cond.duration_seconds === "number"
          ? cond.duration_seconds
          : undefined,
    };
  } else if (cond.type === "rate_of_change") {
    if (typeof cond.parameter !== "string" || !cond.parameter) {
      throw new Error(`${source}[${r.id}]: rate_of_change condition missing 'parameter'`);
    }
    if (typeof cond.max_change_per_second !== "number") {
      throw new Error(`${source}[${r.id}]: rate_of_change condition 'max_change_per_second' must be a number`);
    }
    condition = {
      type: "rate_of_change",
      parameter: cond.parameter,
      max_change_per_second: cond.max_change_per_second,
      duration_seconds:
        typeof cond.duration_seconds === "number"
          ? cond.duration_seconds
          : undefined,
    };
  } else if (cond.type === "absence") {
    if (typeof cond.max_gap_seconds !== "number") {
      throw new Error(`${source}[${r.id}]: absence condition 'max_gap_seconds' must be a number`);
    }
    condition = {
      type: "absence",
      max_gap_seconds: cond.max_gap_seconds,
    };
  } else {
    throw new Error(
      `${source}[${r.id}]: unknown condition type '${String(cond.type)}'. Must be threshold, rate_of_change, or absence`
    );
  }

  // Optional SPARTA mapping
  let sparta: SpartaMapping | undefined;
  if (r.sparta !== undefined) {
    if (typeof r.sparta !== "object" || r.sparta === null) {
      throw new Error(`${source}[${r.id}]: 'sparta' must be an object`);
    }
    const s = r.sparta as Record<string, unknown>;
    if (typeof s.tactic !== "string" || typeof s.technique !== "string") {
      throw new Error(`${source}[${r.id}]: sparta must have string 'tactic' and 'technique'`);
    }
    sparta = { tactic: s.tactic, technique: s.technique };
  }

  // Optional MITRE ATT&CK mapping
  let mitre: MitreMapping | undefined;
  if (r.mitre !== undefined) {
    if (typeof r.mitre !== "object" || r.mitre === null) {
      throw new Error(`${source}[${r.id}]: 'mitre' must be an object`);
    }
    const m = r.mitre as Record<string, unknown>;
    if (typeof m.technique_id !== "string" || typeof m.technique_name !== "string") {
      throw new Error(`${source}[${r.id}]: mitre must have string 'technique_id' and 'technique_name'`);
    }
    mitre = { techniqueId: m.technique_id, techniqueName: m.technique_name };
  }

  // Optional NIS2 article references
  let nis2Articles: string[] | undefined;
  if (r.nis2_articles !== undefined) {
    if (!Array.isArray(r.nis2_articles)) {
      throw new Error(`${source}[${r.id}]: 'nis2_articles' must be an array of strings`);
    }
    nis2Articles = (r.nis2_articles as unknown[]).map(String);
  }

  // Actions: array of strings or {key: value} objects
  const actions: DetectionRule["actions"] = Array.isArray(r.actions)
    ? (r.actions as DetectionRule["actions"])
    : ["alert"];

  return {
    id: r.id.trim(),
    name: r.name.trim(),
    description: r.description.trim(),
    severity: r.severity,
    sparta,
    mitre,
    nis2Articles,
    condition,
    actions,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads and validates all YAML rule files from the detection/rules/ directory.
 *
 * Each YAML file must have a top-level `rules:` array. Files that fail to
 * parse or validate are logged to stderr and skipped so a single bad file does
 * not break the entire detection engine.
 *
 * @returns Flat array of all validated DetectionRule objects across all files.
 */
export function loadRules(): DetectionRule[] {
  let files: string[];
  try {
    files = readdirSync(RULES_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch (err) {
    console.error(`[rule-loader] Cannot read rules directory ${RULES_DIR}:`, err);
    return [];
  }

  if (files.length === 0) {
    console.warn(`[rule-loader] No YAML rule files found in ${RULES_DIR}`);
    return [];
  }

  const allRules: DetectionRule[] = [];

  for (const filename of files) {
    const filePath = join(RULES_DIR, filename);
    try {
      const raw = yamlLoad(readFileSync(filePath, "utf-8"));

      if (typeof raw !== "object" || raw === null) {
        console.error(`[rule-loader] ${filename}: YAML must be an object with a 'rules' key`);
        continue;
      }

      const doc = raw as Record<string, unknown>;

      if (!Array.isArray(doc.rules)) {
        console.error(`[rule-loader] ${filename}: top-level 'rules' key must be an array`);
        continue;
      }

      const fileRules: DetectionRule[] = [];
      for (const rawRule of doc.rules) {
        try {
          const rule = parseRule(rawRule, filename);
          rule.sourceFile = filename;
          fileRules.push(rule);
        } catch (ruleErr) {
          console.error(`[rule-loader] Skipping invalid rule:`, ruleErr instanceof Error ? ruleErr.message : ruleErr);
        }
      }

      console.info(`[rule-loader] Loaded ${fileRules.length} rule(s) from ${filename}`);
      allRules.push(...fileRules);
    } catch (fileErr) {
      console.error(`[rule-loader] Failed to parse ${filename}:`, fileErr instanceof Error ? fileErr.message : fileErr);
    }
  }

  // Warn if the same rule ID appears more than once (across all files)
  const idCounts = new Map<string, number>();
  for (const rule of allRules) {
    idCounts.set(rule.id, (idCounts.get(rule.id) ?? 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      console.warn(`[rule-loader] Duplicate rule ID '${id}' found ${count} times`);
    }
  }

  return allRules;
}

/**
 * Loads rules and returns them as a Map keyed by rule ID for O(1) lookup.
 */
export function loadRulesMap(): Map<string, DetectionRule> {
  const rules = loadRules();
  return new Map(rules.map((r) => [r.id, r]));
}
