import { pgTable, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

// ---------------------------------------------------------------------------
// Dashboard Layouts
// ---------------------------------------------------------------------------

export interface WidgetConfig {
  widget_id: string;
  position: { row: number; col: number };
  size: { w: number; h: number };
  config: Record<string, unknown>;
}

export const dashboardLayouts = pgTable("dashboard_layouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  layout: jsonb("layout").$type<WidgetConfig[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DashboardLayout = typeof dashboardLayouts.$inferSelect;
export type NewDashboardLayout = typeof dashboardLayouts.$inferInsert;
