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

export const auditActionEnum = pgEnum("audit_action", [
  "CREATE",
  "UPDATE",
  "DELETE",
  "VIEW",
  "EXPORT",
  "LOGIN",
  "LOGOUT",
  "STATUS_CHANGE",
  "REPORT_GENERATED",
  "ALERT_ACKNOWLEDGED",
  "INCIDENT_CREATED",
  "MAPPING_CHANGED",
  "TEST_NOTIFICATION",
  "KEY_REGENERATION",
]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" }
    ),
    actor: varchar("actor", { length: 255 }).notNull().default("system"),
    action: auditActionEnum("action").notNull(),
    resourceType: varchar("resource_type", { length: 100 }),
    resourceId: uuid("resource_id"),
    details: jsonb("details"),
    ipAddress: varchar("ip_address", { length: 45 }),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_audit_log_org_ts").on(t.organizationId, t.timestamp),
    index("idx_audit_log_actor").on(t.actor),
    index("idx_audit_log_resource").on(t.resourceType, t.resourceId),
  ]
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
