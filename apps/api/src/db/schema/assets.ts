import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  pgEnum,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const assetTypeEnum = pgEnum("asset_type", [
  // Original top-level types
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
  // Space Segment subsystems (ENISA Annex B)
  "CDHS",
  "COM_SUBSYSTEM",
  "ADCS",
  "EPS",
  "PAYLOAD",
  "PROPULSION",
  "THERMAL",
  // Ground Segment subsystems (ENISA Annex B)
  "TTC_ANTENNA",
  "SLE_INTERFACE",
  "CRYPTO_UNIT_GROUND",
  "MISSION_PLANNING",
  "FLIGHT_DYNAMICS",
  "GROUND_NETWORK",
  // User Segment
  "VSAT_TERMINAL",
  "USER_MODEM",
  "USER_APPLICATION",
  // Human Resources
  "OPERATIONS_TEAM",
  "ENGINEERING_TEAM",
  "SECURITY_TEAM",
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

export const assetSegmentEnum = pgEnum("asset_segment", [
  "SPACE",
  "GROUND",
  "USER",
  "HUMAN_RESOURCES",
]);

export const lifecyclePhaseEnum = pgEnum("lifecycle_phase", [
  "PHASE_0_MISSION_ANALYSIS",
  "PHASE_A_FEASIBILITY",
  "PHASE_B_DEFINITION",
  "PHASE_C_QUALIFICATION",
  "PHASE_D_PRODUCTION",
  "PHASE_E_OPERATIONS",
  "PHASE_F_DISPOSAL",
]);

export const spaceAssets = pgTable(
  "space_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    parentAssetId: uuid("parent_asset_id"),
    name: varchar("name", { length: 255 }).notNull(),
    assetType: assetTypeEnum("asset_type").notNull(),
    segment: assetSegmentEnum("segment"),
    description: text("description"),
    metadata: jsonb("metadata"),
    status: assetStatusEnum("asset_status").notNull().default("OPERATIONAL"),
    criticality: criticalityEnum("criticality").notNull().default("MEDIUM"),
    lifecyclePhase: lifecyclePhaseEnum("lifecycle_phase").default("PHASE_E_OPERATIONS"),
    lifecyclePhaseEnteredAt: timestamp("lifecycle_phase_entered_at", { withTimezone: true }),
    endOfLifeDate: date("end_of_life_date"),
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
    parentIdx: index("space_assets_parent_id_idx").on(table.parentAssetId),
    segmentIdx: index("space_assets_segment_idx").on(table.segment),
  })
);

export type SpaceAsset = typeof spaceAssets.$inferSelect;
export type NewSpaceAsset = typeof spaceAssets.$inferInsert;
