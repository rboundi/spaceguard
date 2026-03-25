import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  pgEnum,
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
