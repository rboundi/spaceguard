import {
  pgTable,
  uuid,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { spaceAssets } from "./assets";

export const riskScoresHistory = pgTable(
  "risk_scores_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => spaceAssets.id, {
      onDelete: "cascade",
    }),
    score: integer("score").notNull(),
    breakdown: jsonb("breakdown").notNull().$type<{
      compliance: number;
      threat: number;
      alerts: number;
      supplyChain: number;
      config: number;
    }>(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("risk_scores_org_id_idx").on(table.organizationId),
    assetIdIdx: index("risk_scores_asset_id_idx").on(table.assetId),
    calcAtIdx: index("risk_scores_calc_at_idx").on(table.calculatedAt),
    orgCalcIdx: index("risk_scores_org_calc_idx").on(
      table.organizationId,
      table.calculatedAt,
    ),
  }),
);

export type RiskScoreHistory = typeof riskScoresHistory.$inferSelect;
export type NewRiskScoreHistory = typeof riskScoresHistory.$inferInsert;
