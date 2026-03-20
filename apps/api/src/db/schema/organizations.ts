import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const nis2ClassificationEnum = pgEnum("nis2_classification", [
  "ESSENTIAL",
  "IMPORTANT",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  nis2Classification: nis2ClassificationEnum("nis2_classification").notNull(),
  country: varchar("country", { length: 2 }).notNull(),
  sector: varchar("sector", { length: 100 }).notNull().default("space"),
  contactEmail: varchar("contact_email", { length: 255 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
