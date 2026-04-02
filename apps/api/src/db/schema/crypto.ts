import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  date,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { spaceAssets } from "./assets";

export const cryptoMechanismTypeEnum = pgEnum("crypto_mechanism_type", [
  "LINK_ENCRYPTION",
  "DATA_AT_REST",
  "DATA_IN_TRANSIT",
  "KEY_MANAGEMENT",
  "AUTHENTICATION",
  "DIGITAL_SIGNATURE",
  "OTAR",
]);

export const pqcMigrationStatusEnum = pgEnum("pqc_migration_status", [
  "NOT_STARTED",
  "EVALUATING",
  "MIGRATION_PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "NOT_APPLICABLE",
]);

export const cryptoStatusEnum = pgEnum("crypto_status", [
  "ACTIVE",
  "DEPRECATED",
  "DISABLED",
]);

export const cryptoInventory = pgTable(
  "crypto_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => spaceAssets.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    mechanismType: cryptoMechanismTypeEnum("mechanism_type").notNull(),
    algorithm: varchar("algorithm", { length: 100 }).notNull(),
    keyLengthBits: integer("key_length_bits"),
    protocol: varchar("protocol", { length: 100 }),
    implementation: varchar("implementation", { length: 255 }),
    pqcVulnerable: boolean("pqc_vulnerable").notNull().default(false),
    pqcMigrationStatus: pqcMigrationStatusEnum("pqc_migration_status")
      .notNull()
      .default("NOT_APPLICABLE"),
    keyLastRotated: date("key_last_rotated"),
    keyRotationIntervalDays: integer("key_rotation_interval_days"),
    keyNextRotation: date("key_next_rotation"),
    certificateExpiry: date("certificate_expiry"),
    status: cryptoStatusEnum("status").notNull().default("ACTIVE"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("crypto_inv_org_idx").on(table.organizationId),
    assetIdx: index("crypto_inv_asset_idx").on(table.assetId),
  })
);

export type CryptoEntry = typeof cryptoInventory.$inferSelect;
