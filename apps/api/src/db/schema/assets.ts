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

export const assetTypeEnum = pgEnum("asset_type", [
  "LEO_SATELLITE",
  "MEO_SATELLITE",
  "GEO_SATELLITE",
  "GROUND_STATION",
  "CONTROL_CENTER",
  "UPLINK",
  "DOWNLINK",
  "INTER_SATELLITE_LINK",
  "DATA_CENTER",
  "NETWORK_SEGMENT",
]);

export const assetStatusEnum = pgEnum("asset_status", [
  "OPERATIONAL",
  "DEGRADED",
  "MAINTENANCE",
  "DECOMMISSIONED",
]);

export const criticalityEnum = pgEnum("criticality", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const spaceAssets = pgTable(
  "space_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    assetType: assetTypeEnum("asset_type").notNull(),
    description: text("description"),
    metadata: jsonb("metadata"),
    status: assetStatusEnum("asset_status").notNull().default("OPERATIONAL"),
    criticality: criticalityEnum("criticality").notNull().default("MEDIUM"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("space_assets_org_id_idx").on(table.organizationId),
    statusIdx: index("space_assets_status_idx").on(table.status),
    typeIdx: index("space_assets_type_idx").on(table.assetType),
  })
);

export type SpaceAsset = typeof spaceAssets.$inferSelect;
export type NewSpaceAsset = typeof spaceAssets.$inferInsert;
