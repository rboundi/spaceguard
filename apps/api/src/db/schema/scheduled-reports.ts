import {
  pgTable,
  uuid,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const scheduledReportTypeEnum = pgEnum("scheduled_report_type", [
  "COMPLIANCE",
  "INCIDENT_SUMMARY",
  "THREAT_BRIEFING",
  "SUPPLY_CHAIN",
  "AUDIT_TRAIL",
]);

export const reportScheduleEnum = pgEnum("report_schedule", [
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
]);

export const scheduledReports = pgTable("scheduled_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  reportType: scheduledReportTypeEnum("report_type").notNull(),
  schedule: reportScheduleEnum("schedule").notNull(),
  dayOfWeek: integer("day_of_week"), // 0-6, for WEEKLY (0 = Sunday)
  dayOfMonth: integer("day_of_month"), // 1-28, for MONTHLY / QUARTERLY
  recipients: jsonb("recipients").notNull().$type<string[]>(),
  lastGenerated: timestamp("last_generated", { withTimezone: true }),
  nextRun: timestamp("next_run", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ScheduledReport = typeof scheduledReports.$inferSelect;
export type NewScheduledReport = typeof scheduledReports.$inferInsert;
