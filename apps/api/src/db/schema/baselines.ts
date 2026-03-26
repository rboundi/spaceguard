import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  doublePrecision,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { telemetryStreams } from "./telemetry";

/**
 * Telemetry baselines store rolling statistical summaries for each
 * (stream, parameter) pair. The anomaly detector updates these on every
 * incoming point and uses them to calculate z-scores for anomaly detection.
 *
 * UNIQUE constraint on (stream_id, parameter_name) ensures one baseline
 * row per parameter per stream.
 */
export const telemetryBaselines = pgTable(
  "telemetry_baselines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => telemetryStreams.id, { onDelete: "cascade" }),
    parameterName: varchar("parameter_name", { length: 255 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    mean: doublePrecision("mean").notNull(),
    stdDeviation: doublePrecision("std_deviation").notNull(),
    minValue: doublePrecision("min_value").notNull(),
    maxValue: doublePrecision("max_value").notNull(),
    sampleCount: integer("sample_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    streamParamUniq: unique("telemetry_baselines_stream_param_uniq").on(
      table.streamId,
      table.parameterName
    ),
    streamIdx: index("telemetry_baselines_stream_idx").on(table.streamId),
  })
);

// Inferred types
export type TelemetryBaseline = typeof telemetryBaselines.$inferSelect;
export type NewTelemetryBaseline = typeof telemetryBaselines.$inferInsert;
