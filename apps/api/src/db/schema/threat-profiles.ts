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
import { spaceAssets } from "./assets";

export const missionTypeEnum = pgEnum("mission_type", [
  "EARTH_OBSERVATION",
  "COMMUNICATIONS",
  "NAVIGATION",
  "IOT",
  "SSA",
  "SCIENCE",
  "DEFENSE",
  "OTHER",
]);

export const orbitRegimeEnum = pgEnum("orbit_regime", [
  "LEO",
  "MEO",
  "GEO",
  "HEO",
  "SSO",
  "CISLUNAR",
  "GROUND_ONLY",
]);

export const adversaryCapabilityEnum = pgEnum("adversary_capability", [
  "OPPORTUNISTIC",
  "ORGANIZED_CRIME",
  "NATION_STATE_TIER1",
  "NATION_STATE_TIER2",
]);

export const threatProfiles = pgTable(
  "threat_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => spaceAssets.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    missionType: missionTypeEnum("mission_type").notNull(),
    orbitRegime: orbitRegimeEnum("orbit_regime").notNull(),
    adversaryCapability: adversaryCapabilityEnum("adversary_capability")
      .notNull()
      .default("ORGANIZED_CRIME"),
    spacecraftConstraints: jsonb("spacecraft_constraints"),
    groundSegmentProfile: jsonb("ground_segment_profile"),
    generatedBaseline: jsonb("generated_baseline"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("threat_profiles_org_idx").on(table.organizationId),
    assetIdx: index("threat_profiles_asset_idx").on(table.assetId),
  })
);

export type ThreatProfile = typeof threatProfiles.$inferSelect;
