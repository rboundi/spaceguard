import { Hono } from "hono";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { assertUUID } from "../middleware/validate";
import {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  listUsers,
  updateUser,
} from "../services/auth.service";
import { authMiddleware, adminOnly } from "../middleware/auth-guard";
import { logAudit, extractIp } from "../middleware/audit";
import { db } from "../db/client";
import { users } from "../db/schema/users";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(255),
  organizationId: z.string().uuid(),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER", "AUDITOR"]).default("VIEWER"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  password: z.string().min(8).optional(),
  notifyCriticalAlerts: z.boolean().optional(),
  notifyDeadlines: z.boolean().optional(),
  notifyWeeklyDigest: z.boolean().optional(),
});

const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER", "AUDITOR"]).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).max(255).optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const authRoutes = new Hono();

// ---------------------------------------------------------------------------
// Public: login
// ---------------------------------------------------------------------------

authRoutes.post("/auth/login", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const result = await login(parsed.data.email, parsed.data.password);

  logAudit({
    organizationId: result.user.organizationId,
    actor: result.user.email,
    action: "LOGIN",
    resourceType: "user",
    resourceId: result.user.id,
    ipAddress: extractIp(c),
  });

  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// Public: check if any users exist (for first-user bootstrap)
// ---------------------------------------------------------------------------

authRoutes.get("/auth/setup-status", async (c) => {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .limit(1);

  return c.json({ hasUsers: !!row });
});

// ---------------------------------------------------------------------------
// Protected routes below
// ---------------------------------------------------------------------------

// POST /auth/register - admin only (or open if no users exist yet)
authRoutes.post("/auth/register", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  // Check if any users exist; if not, allow open registration (first-user bootstrap)
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .limit(1);

  if (existingUser) {
    // Users exist: require auth + admin role
    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Admin authentication required" });
    }
    // Run the auth middleware inline
    const { validateToken } = await import("../services/auth.service");
    const payload = await validateToken(header.slice(7));
    if (payload.role !== "ADMIN") {
      throw new HTTPException(403, { message: "Only admins can register new users" });
    }
  }

  const user = await register(
    parsed.data.email,
    parsed.data.password,
    parsed.data.name,
    parsed.data.organizationId,
    parsed.data.role
  );

  logAudit({
    organizationId: user.organizationId,
    actor: existingUser ? c.req.header("Authorization") ? "admin" : "system" : "bootstrap",
    action: "CREATE",
    resourceType: "user",
    resourceId: user.id,
    details: { email: user.email, role: user.role },
    ipAddress: extractIp(c),
  });

  return c.json(user, 201);
});

// All routes below require authentication
authRoutes.use("/auth/me", authMiddleware);
authRoutes.use("/auth/logout", authMiddleware);
authRoutes.use("/users", authMiddleware);
authRoutes.use("/users/*", authMiddleware);

// POST /auth/logout
authRoutes.post("/auth/logout", async (c) => {
  const token = c.req.header("Authorization")?.slice(7) ?? "";
  await logout(token);

  const user = c.get("user");
  logAudit({
    organizationId: user.organizationId,
    actor: user.email,
    action: "LOGOUT",
    resourceType: "user",
    resourceId: user.userId,
    ipAddress: extractIp(c),
  });

  return c.json({ message: "Logged out" }, 200);
});

// GET /auth/me
authRoutes.get("/auth/me", async (c) => {
  const payload = c.get("user");
  const user = await getMe(payload.userId);
  return c.json(user, 200);
});

// PUT /auth/me
authRoutes.put("/auth/me", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const payload = c.get("user");
  const user = await updateProfile(payload.userId, parsed.data);
  return c.json(user, 200);
});

// ---------------------------------------------------------------------------
// Admin: user management
// ---------------------------------------------------------------------------

// GET /users
authRoutes.get("/users", adminOnly, async (c) => {
  const orgId = c.req.query("organizationId");
  const result = await listUsers(orgId);
  return c.json({ data: result, total: result.length }, 200);
});

// PUT /users/:id
authRoutes.put("/users/:id", adminOnly, async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const adminUser = c.get("user");

  // Prevent admin from deactivating themselves
  if (id === adminUser.userId && parsed.data.isActive === false) {
    return c.json({ error: "You cannot deactivate your own account" }, 400);
  }

  const user = await updateUser(id, parsed.data);

  logAudit({
    organizationId: adminUser.organizationId,
    actor: adminUser.email,
    action: "UPDATE",
    resourceType: "user",
    resourceId: id,
    details: parsed.data,
    ipAddress: extractIp(c),
  });

  return c.json(user, 200);
});
