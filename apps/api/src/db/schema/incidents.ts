import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  jsonb,
  integer,
  boolean,
  doublePrecision,
  index,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { alerts } from "./alerts";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const incidentSeverityEnum = pgEnum("incident_severity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "DETECTED",
  "TRIAGING",
  "INVESTIGATING",
  "CONTAINING",
  "ERADICATING",
  "RECOVERING",
  "CLOSED",
  "FALSE_POSITIVE",
]);

export const incidentNis2ClassificationEnum = pgEnum(
  "incident_nis2_classification",
  ["SIGNIFICANT", "NON_SIGNIFICANT"]
);

export const incidentReportTypeEnum = pgEnum("incident_report_type", [
  "EARLY_WARNING",
  "INCIDENT_NOTIFICATION",
  "INTERMEDIATE_REPORT",
  "FINAL_REPORT",
]);

export const escalationLevelEnum = pgEnum("escalation_level", [
  "CYBER_INCIDENT",
  "LARGE_SCALE_INCIDENT",
  "CYBER_CRISIS",
]);

export const managementLevelEnum = pgEnum("management_level", [
  "TECHNICAL",
  "OPERATIONAL",
  "STRATEGIC",
]);

export const csirtNotificationStatusEnum = pgEnum("csirt_notification_status", [
  "NOT_REQUIRED",
  "PENDING",
  "NOTIFIED",
  "ACKNOWLEDGED",
]);

// ---------------------------------------------------------------------------
// incidents
// ---------------------------------------------------------------------------

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 500 }).notNull(),
    description: text("description").notNull(),

    severity: incidentSeverityEnum("severity").notNull(),
    status: incidentStatusEnum("status").notNull().default("DETECTED"),

    nis2Classification: incidentNis2ClassificationEnum(
      "nis2_classification"
    )
      .notNull()
      .default("NON_SIGNIFICANT"),

    // jsonb: SpartaTechniqueEntry[]
    spartaTechniques: jsonb("sparta_techniques").notNull().default([]),

    // jsonb: string[] (asset UUIDs)
    affectedAssetIds: jsonb("affected_asset_ids").notNull().default([]),

    // jsonb: TimelineEntry[]
    timeline: jsonb("timeline").notNull().default([]),

    detectedAt: timestamp("detected_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    // Calculated response-time metrics (nullable until incident closes)
    timeToDetectMinutes: integer("time_to_detect_minutes"),
    timeToRespondMinutes: integer("time_to_respond_minutes"),

    // Correlation engine metadata (nullable: only set for auto-correlated incidents)
    correlationRule: varchar("correlation_rule", { length: 100 }),
    correlationScore: doublePrecision("correlation_score"),

    // ENISA three-tier crisis escalation
    escalationLevel: escalationLevelEnum("escalation_level")
      .notNull()
      .default("CYBER_INCIDENT"),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    escalationReason: text("escalation_reason"),
    managementLevel: managementLevelEnum("management_level")
      .notNull()
      .default("TECHNICAL"),
    crossBorderImpact: boolean("cross_border_impact").notNull().default(false),
    affectedMemberStates: jsonb("affected_member_states"),
    csirtNotificationStatus: csirtNotificationStatusEnum("csirt_notification_status")
      .notNull()
      .default("NOT_REQUIRED"),
    csirtContact: varchar("csirt_contact", { length: 255 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("incidents_org_id_idx").on(table.organizationId),
    statusIdx: index("incidents_status_idx").on(table.status),
    severityIdx: index("incidents_severity_idx").on(table.severity),
    createdAtIdx: index("incidents_created_at_idx").on(table.createdAt),
    orgStatusIdx: index("incidents_org_status_idx").on(
      table.organizationId,
      table.status
    ),
  })
);

// ---------------------------------------------------------------------------
// incident_alerts (junction: many incidents <-> many alerts)
// ---------------------------------------------------------------------------

export const incidentAlerts = pgTable(
  "incident_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),

    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    incidentIdIdx: index("incident_alerts_incident_id_idx").on(
      table.incidentId
    ),
    alertIdIdx: index("incident_alerts_alert_id_idx").on(table.alertId),
    // An alert can only be linked to a given incident once
    uniqueLink: unique("incident_alerts_unique").on(
      table.incidentId,
      table.alertId
    ),
  })
);

// ---------------------------------------------------------------------------
// incident_notes
// ---------------------------------------------------------------------------

export const incidentNotes = pgTable(
  "incident_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),

    author: varchar("author", { length: 255 }).notNull(),
    content: text("content").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    incidentIdIdx: index("incident_notes_incident_id_idx").on(
      table.incidentId
    ),
  })
);

// ---------------------------------------------------------------------------
// incident_reports (NIS2 Article 23 regulatory reports)
// ---------------------------------------------------------------------------

export const incidentReports = pgTable(
  "incident_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),

    reportType: incidentReportTypeEnum("report_type").notNull(),

    // Structured Nis2ReportContent object
    content: jsonb("content").notNull().default({}),

    // Regulatory authority the report was sent to (e.g. "ENISA", "BSI")
    submittedTo: varchar("submitted_to", { length: 255 }),

    // Populated when the operator marks the report as submitted
    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    // NIS2 Article 23 deadline for this report type
    deadline: timestamp("deadline", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    incidentIdIdx: index("incident_reports_incident_id_idx").on(
      table.incidentId
    ),
  })
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;

export type IncidentAlert = typeof incidentAlerts.$inferSelect;
export type NewIncidentAlert = typeof incidentAlerts.$inferInsert;

export type IncidentNote = typeof incidentNotes.$inferSelect;
export type NewIncidentNote = typeof incidentNotes.$inferInsert;

export type IncidentReport = typeof incidentReports.$inferSelect;
export type NewIncidentReport = typeof incidentReports.$inferInsert;
