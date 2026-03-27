import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const syslogProtocolEnum = pgEnum("syslog_protocol", [
  "UDP",
  "TCP",
  "TLS",
]);

export const syslogFormatEnum = pgEnum("syslog_format", [
  "CEF",
  "LEEF",
  "JSON",
]);

export const syslogMinSeverityEnum = pgEnum("syslog_min_severity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export const syslogEndpoints = pgTable(
  "syslog_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),

    host: varchar("host", { length: 255 }).notNull(),

    port: integer("port").notNull().default(514),

    protocol: syslogProtocolEnum("protocol").notNull().default("UDP"),

    format: syslogFormatEnum("format").notNull().default("CEF"),

    minSeverity: syslogMinSeverityEnum("min_severity")
      .notNull()
      .default("LOW"),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("syslog_endpoints_org_id_idx").on(table.organizationId),
    activeIdx: index("syslog_endpoints_active_idx").on(
      table.organizationId,
      table.isActive
    ),
  })
);

// Inferred types
export type SyslogEndpoint = typeof syslogEndpoints.$inferSelect;
export type NewSyslogEndpoint = typeof syslogEndpoints.$inferInsert;
