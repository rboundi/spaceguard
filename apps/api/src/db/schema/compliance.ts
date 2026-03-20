import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { spaceAssets } from "./assets";

export const regulationEnum = pgEnum("regulation", [
  "NIS2",
  "CRA",
  "EU_SPACE_ACT",
  "ENISA_SPACE",
]);

export const complianceStatusEnum = pgEnum("compliance_status", [
  "NOT_ASSESSED",
  "NON_COMPLIANT",
  "PARTIALLY_COMPLIANT",
  "COMPLIANT",
]);

// Pre-populated, read-only reference data (loaded by seed script)
export const complianceRequirements = pgTable(
  "compliance_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    regulation: regulationEnum("regulation").notNull(),
    articleReference: varchar("article_reference", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    evidenceGuidance: text("evidence_guidance").notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    applicabilityNotes: text("applicability_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    regulationIdx: index("compliance_req_regulation_idx").on(table.regulation),
    categoryIdx: index("compliance_req_category_idx").on(table.category),
  })
);

// Maps organizations (and optionally specific assets) to compliance requirements
export const complianceMappings = pgTable(
  "compliance_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Nullable: a mapping can be at org-level (no specific asset) or asset-level
    assetId: uuid("asset_id").references(() => spaceAssets.id, {
      onDelete: "set null",
    }),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => complianceRequirements.id, { onDelete: "cascade" }),
    status: complianceStatusEnum("status").notNull().default("NOT_ASSESSED"),
    evidenceDescription: text("evidence_description"),
    responsiblePerson: varchar("responsible_person", { length: 255 }),
    nextReviewDate: varchar("next_review_date", { length: 10 }), // ISO date string YYYY-MM-DD
    notes: text("notes"),
    lastAssessed: timestamp("last_assessed", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("compliance_mappings_org_id_idx").on(table.organizationId),
    requirementIdIdx: index("compliance_mappings_req_id_idx").on(
      table.requirementId
    ),
    statusIdx: index("compliance_mappings_status_idx").on(table.status),
    assetIdIdx: index("compliance_mappings_asset_id_idx").on(table.assetId),
  })
);

export type ComplianceRequirement = typeof complianceRequirements.$inferSelect;
export type NewComplianceRequirement =
  typeof complianceRequirements.$inferInsert;
export type ComplianceMapping = typeof complianceMappings.$inferSelect;
export type NewComplianceMapping = typeof complianceMappings.$inferInsert;
