import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  integer,
  real,
  doublePrecision,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { spaceAssets } from "./assets";

// Enums

export const streamProtocolEnum = pgEnum("stream_protocol", [
  "CCSDS_TM",
  "CCSDS_TC",
  "SYSLOG",
  "SNMP",
  "CUSTOM",
]);

export const streamStatusEnum = pgEnum("stream_status", [
  "ACTIVE",
  "PAUSED",
  "ERROR",
]);

export const telemetryQualityEnum = pgEnum("telemetry_quality", [
  "GOOD",
  "SUSPECT",
  "BAD",
]);

export const logSeverityEnum = pgEnum("log_severity", [
  "DEBUG",
  "INFO",
  "NOTICE",
  "WARNING",
  "ERROR",
  "CRITICAL",
  "ALERT",
  "EMERGENCY",
]);

// Tables

export const telemetryStreams = pgTable(
  "telemetry_streams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => spaceAssets.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    protocol: streamProtocolEnum("protocol").notNull(),
    apid: integer("apid"),
    sampleRateHz: real("sample_rate_hz"),
    status: streamStatusEnum("status").notNull().default("ACTIVE"),
    apiKey: varchar("api_key", { length: 64 }).notNull(),
    /** Anomaly detection is suppressed until this timestamp (24h after creation by default). */
    learningModeUntil: timestamp("learning_mode_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("telemetry_streams_org_id_idx").on(table.organizationId),
    assetIdIdx: index("telemetry_streams_asset_id_idx").on(table.assetId),
    apiKeyUniq: unique("telemetry_streams_api_key_uniq").on(table.apiKey),
  })
);

// NOTE: This table is converted to a TimescaleDB hypertable after creation.
// Run: SELECT create_hypertable('telemetry_points', 'time');
export const telemetryPoints = pgTable(
  "telemetry_points",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => telemetryStreams.id, { onDelete: "cascade" }),
    parameterName: varchar("parameter_name", { length: 255 }).notNull(),
    valueNumeric: doublePrecision("value_numeric"),
    valueText: varchar("value_text", { length: 1024 }),
    quality: telemetryQualityEnum("quality").notNull().default("GOOD"),
  },
  (table) => ({
    // Composite index for time-series queries: fetch all params for a stream in a time range
    streamTimeIdx: index("telemetry_points_stream_time_idx").on(
      table.streamId,
      table.time
    ),
    // Index for querying a specific parameter across time
    streamParamTimeIdx: index("telemetry_points_stream_param_time_idx").on(
      table.streamId,
      table.parameterName,
      table.time
    ),
  })
);

export const groundSegmentLogs = pgTable(
  "ground_segment_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 255 }).notNull(),
    severity: logSeverityEnum("severity").notNull(),
    message: text("message").notNull(),
    structuredData: jsonb("structured_data"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("ground_segment_logs_org_id_idx").on(table.organizationId),
    severityIdx: index("ground_segment_logs_severity_idx").on(table.severity),
    timestampIdx: index("ground_segment_logs_timestamp_idx").on(table.timestamp),
  })
);

// Inferred types
export type TelemetryStream = typeof telemetryStreams.$inferSelect;
export type NewTelemetryStream = typeof telemetryStreams.$inferInsert;
export type TelemetryPoint = typeof telemetryPoints.$inferSelect;
export type NewTelemetryPoint = typeof telemetryPoints.$inferInsert;
export type GroundSegmentLog = typeof groundSegmentLogs.$inferSelect;
export type NewGroundSegmentLog = typeof groundSegmentLogs.$inferInsert;
