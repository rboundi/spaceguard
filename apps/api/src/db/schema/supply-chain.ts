import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  date,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const supplierTypeEnum = pgEnum("supplier_type", [
  "COMPONENT_MANUFACTURER",
  "GROUND_STATION_OPERATOR",
  "LAUNCH_PROVIDER",
  "CLOUD_PROVIDER",
  "SOFTWARE_VENDOR",
  "INTEGRATION_PARTNER",
  "DATA_RELAY_PROVIDER",
]);

export const supplierCriticalityEnum = pgEnum("supplier_criticality", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const slaComplianceStatusEnum = pgEnum("sla_compliance_status", [
  "COMPLIANT",
  "BREACH",
  "UNKNOWN",
]);

export const questionnaireStatusEnum = pgEnum("questionnaire_status", [
  "DRAFT",
  "SENT",
  "COMPLETED",
  "EXPIRED",
]);

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: supplierTypeEnum("type").notNull(),
  country: varchar("country", { length: 2 }).notNull(),
  criticality: supplierCriticalityEnum("criticality").notNull().default("MEDIUM"),
  description: text("description"),
  contactInfo: jsonb("contact_info"),
  assetsSupplied: jsonb("assets_supplied"),
  securityAssessment: jsonb("security_assessment"),
  // Enhanced supply chain fields
  componentsSupplied: jsonb("components_supplied"),
  lastSecurityAudit: date("last_security_audit"),
  nextAuditDue: date("next_audit_due"),
  auditProvider: varchar("audit_provider", { length: 255 }),
  contractualSecurityClauses: jsonb("contractual_security_clauses"),
  slaComplianceStatus: slaComplianceStatusEnum("sla_compliance_status")
    .notNull()
    .default("UNKNOWN"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const vendorQuestionnaires = pgTable(
  "vendor_questionnaires",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: questionnaireStatusEnum("status").notNull().default("DRAFT"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    responses: jsonb("responses"),
    riskScoreCalculated: integer("risk_score_calculated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    supplierIdx: index("vendor_q_supplier_idx").on(table.supplierId),
    orgIdx: index("vendor_q_org_idx").on(table.organizationId),
  })
);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
export type VendorQuestionnaire = typeof vendorQuestionnaires.$inferSelect;
