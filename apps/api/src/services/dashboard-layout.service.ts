import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  dashboardLayouts,
  type DashboardLayout,
  type WidgetConfig,
} from "../db/schema/dashboard-layouts";

// ---------------------------------------------------------------------------
// Default layout (matches the current static dashboard arrangement)
// ---------------------------------------------------------------------------

export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { widget_id: "compliance_score", position: { row: 0, col: 0 }, size: { w: 2, h: 1 }, config: {} },
  { widget_id: "active_alerts", position: { row: 0, col: 2 }, size: { w: 2, h: 1 }, config: {} },
  { widget_id: "risk_gauge", position: { row: 0, col: 4 }, size: { w: 2, h: 1 }, config: {} },
  { widget_id: "asset_overview", position: { row: 0, col: 6 }, size: { w: 2, h: 1 }, config: {} },
  { widget_id: "recent_alerts", position: { row: 1, col: 0 }, size: { w: 5, h: 2 }, config: {} },
  { widget_id: "nis2_deadlines", position: { row: 1, col: 5 }, size: { w: 3, h: 2 }, config: {} },
  { widget_id: "compliance_by_category", position: { row: 3, col: 0 }, size: { w: 5, h: 2 }, config: {} },
  { widget_id: "telemetry_health", position: { row: 3, col: 5 }, size: { w: 3, h: 2 }, config: {} },
  { widget_id: "gap_analysis", position: { row: 5, col: 0 }, size: { w: 8, h: 2 }, config: {} },
  { widget_id: "incident_timeline", position: { row: 7, col: 0 }, size: { w: 4, h: 2 }, config: {} },
  { widget_id: "sparta_coverage", position: { row: 7, col: 4 }, size: { w: 4, h: 2 }, config: {} },
  { widget_id: "alert_trend", position: { row: 9, col: 0 }, size: { w: 8, h: 2 }, config: {} },
];

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface DashboardLayoutResponse {
  id: string | null;
  userId: string;
  layout: WidgetConfig[];
  createdAt: string;
  updatedAt: string;
}

function toResponse(row: DashboardLayout): DashboardLayoutResponse {
  return {
    id: row.id,
    userId: row.userId,
    layout: row.layout as WidgetConfig[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the layout for a user. Returns default if none saved.
 */
export async function getLayout(
  userId: string,
): Promise<DashboardLayoutResponse> {
  const [row] = await db
    .select()
    .from(dashboardLayouts)
    .where(eq(dashboardLayouts.userId, userId))
    .limit(1);

  if (row) return toResponse(row);

  // Return virtual default (not persisted until user customizes)
  return {
    id: null,
    userId,
    layout: DEFAULT_LAYOUT,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Save (upsert) the layout for a user.
 */
export async function saveLayout(
  userId: string,
  layout: WidgetConfig[],
): Promise<DashboardLayoutResponse> {
  const now = new Date();

  // Check for existing
  const [existing] = await db
    .select({ id: dashboardLayouts.id })
    .from(dashboardLayouts)
    .where(eq(dashboardLayouts.userId, userId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(dashboardLayouts)
      .set({ layout, updatedAt: now })
      .where(eq(dashboardLayouts.id, existing.id))
      .returning();

    return toResponse(updated);
  }

  const [created] = await db
    .insert(dashboardLayouts)
    .values({ userId, layout, createdAt: now, updatedAt: now })
    .returning();

  return toResponse(created);
}

/**
 * Delete a user's custom layout (resets to default).
 */
export async function resetLayout(userId: string): Promise<void> {
  await db
    .delete(dashboardLayouts)
    .where(eq(dashboardLayouts.userId, userId));
}
