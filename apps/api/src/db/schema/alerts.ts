import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { spaceAssets } from "./assets";
import { telemetryStreams } from "./telemetry";

// Enums

export const alertSeverityEnum = pgEnum("alert_severity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "NEW",
  "INVESTIGATING",
  "RESOLVED",
  "FALSE_POSITIVE",
]);

// Alerts table
// Populated by the detection engine (Module 3) when a rule fires.
// Each row records one triggered rule instance for one organization.

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Which organization does this alert belong to?
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // The telemetry stream that caused the alert (nullable: some rules are
    // not stream-specific, e.g. an absence rule at org level).
    streamId: uuid("stream_id").references(() => telemetryStreams.id, {
      onDelete: "set null",
    }),

    // Which rule definition fired. Matches the `id` field in the YAML rule file,
    // e.g. "SG-TM-001". Not a FK - rule files are config, not DB rows.
    ruleId: varchar("rule_id", { length: 64 }).notNull(),

    severity: alertSeverityEnum("severity").notNull(),

    title: varchar("title", { length: 255 }).notNull(),

    description: text("description").notNull(),

    status: alertStatusEnum("status").notNull().default("NEW"),

    // SPARTA space-attack framework mapping (optional)
    spartaTactic: varchar("sparta_tactic", { length: 100 }),
    spartaTechnique: varchar("sparta_technique", { length: 100 }),

    // The specific space asset implicated by the alert (nullable)
    affectedAssetId: uuid("affected_asset_id").references(() => spaceAssets.id, {
      onDelete: "set null",
    }),

    // When the rule condition was first satisfied
    triggeredAt: timestamp("triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Populated when status transitions to RESOLVED or FALSE_POSITIVE
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    // Free-text field: who resolved it (username / email)
    resolvedBy: varchar("resolved_by", { length: 255 }),

    // Structured context captured at trigger time: parameter values, threshold
    // that was exceeded, window of matched data points, etc.
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdIdx:       index("alerts_org_id_idx").on(table.organizationId),
    statusIdx:      index("alerts_status_idx").on(table.status),
    severityIdx:    index("alerts_severity_idx").on(table.severity),
    triggeredAtIdx: index("alerts_triggered_at_idx").on(table.triggeredAt),
    streamIdIdx:    index("alerts_stream_id_idx").on(table.streamId),
    // Composite index for the most common query: org alerts ordered by time
    orgTriggeredIdx: index("alerts_org_triggered_idx").on(
      table.organizationId,
      table.triggeredAt
    ),
  })
);

// Inferred types
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
