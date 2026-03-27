import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  getLayout,
  saveLayout,
  resetLayout,
  DEFAULT_LAYOUT,
} from "../services/dashboard-layout.service";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const widgetConfigSchema = z.object({
  widget_id: z.string().min(1),
  position: z.object({ row: z.number().int().min(0), col: z.number().int().min(0) }),
  size: z.object({ w: z.number().int().min(1), h: z.number().int().min(1) }),
  config: z.record(z.unknown()).default({}),
});

const saveLayoutSchema = z.object({
  layout: z.array(widgetConfigSchema).min(1).max(20),
}).strict();

// ---------------------------------------------------------------------------
// Helper: extract userId from JWT payload set by authMiddleware
// ---------------------------------------------------------------------------

function getUserId(c: { get(key: "user"): { userId: string } | undefined }): string {
  const user = c.get("user");
  if (!user?.userId) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  return user.userId;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const dashboardLayoutRoutes = new Hono();

/**
 * GET /api/v1/dashboard/layout
 * Requires auth. Returns the current user's dashboard layout.
 */
dashboardLayoutRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const layout = await getLayout(userId);
  return c.json(layout);
});

/**
 * PUT /api/v1/dashboard/layout
 * Requires auth. Saves the user's dashboard layout.
 */
dashboardLayoutRoutes.put("/", async (c) => {
  const userId = getUserId(c);

  const body = await c.req.json();
  const parsed = saveLayoutSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid layout",
    });
  }

  const result = await saveLayout(userId, parsed.data.layout);
  return c.json(result);
});

/**
 * DELETE /api/v1/dashboard/layout
 * Requires auth. Resets the user's dashboard to the default layout.
 */
dashboardLayoutRoutes.delete("/", async (c) => {
  const userId = getUserId(c);
  await resetLayout(userId);
  return c.json({ layout: DEFAULT_LAYOUT });
});
