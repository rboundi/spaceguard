import { eq, and } from "drizzle-orm";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { db } from "../db/client";
import { users, sessions } from "../db/schema/users";
import { UserRole } from "@spaceguard/shared";
import { HTTPException } from "hono/http-exception";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const JWT_SECRET_RAW = process.env.JWT_SECRET ?? "spaceguard-dev-secret-change-in-production";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);
const TOKEN_EXPIRY_HOURS = 24;

// ---------------------------------------------------------------------------
// JWT payload
// ---------------------------------------------------------------------------

export interface TokenPayload extends JWTPayload {
  userId: string;
  organizationId: string;
  role: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt, no external deps)
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

async function signToken(payload: Omit<TokenPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_EXPIRY_HOURS}h`)
    .setIssuer("spaceguard")
    .sign(JWT_SECRET);
}

export async function validateToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: "spaceguard" });
    return payload as TokenPayload;
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
}

// ---------------------------------------------------------------------------
// Auth operations
// ---------------------------------------------------------------------------

export async function register(
  email: string,
  password: string,
  name: string,
  organizationId: string,
  role: string = UserRole.VIEWER
): Promise<{ id: string; email: string; name: string; role: string; organizationId: string }> {
  // Check for existing user with this email
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    throw new HTTPException(409, { message: "A user with this email already exists" });
  }

  const passwordHash = hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      organizationId,
      role: role as "ADMIN" | "OPERATOR" | "VIEWER" | "AUDITOR",
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      organizationId: users.organizationId,
    });

  return user;
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: { id: string; email: string; name: string; role: string; organizationId: string } }> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), eq(users.isActive, true)))
    .limit(1);

  if (!user) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  if (!verifyPassword(password, user.passwordHash)) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  // Generate JWT
  const token = await signToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
  });

  // Store session
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  await db.insert(sessions).values({
    userId: user.id,
    token,
    expiresAt,
  });

  // Update last login
  await db
    .update(users)
    .set({ lastLogin: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    },
  };
}

export async function logout(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function getMe(userId: string): Promise<{
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  isActive: boolean;
  lastLogin: Date | null;
  createdAt: Date;
  notifyCriticalAlerts: boolean;
  notifyDeadlines: boolean;
  notifyWeeklyDigest: boolean;
}> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      organizationId: users.organizationId,
      isActive: users.isActive,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
      notifyCriticalAlerts: users.notifyCriticalAlerts,
      notifyDeadlines: users.notifyDeadlines,
      notifyWeeklyDigest: users.notifyWeeklyDigest,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return user;
}

export async function updateProfile(
  userId: string,
  data: {
    name?: string;
    password?: string;
    notifyCriticalAlerts?: boolean;
    notifyDeadlines?: boolean;
    notifyWeeklyDigest?: boolean;
  }
): Promise<{ id: string; email: string; name: string; role: string }> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name) updates.name = data.name;
  if (data.password) updates.passwordHash = hashPassword(data.password);
  if (data.notifyCriticalAlerts !== undefined) updates.notifyCriticalAlerts = data.notifyCriticalAlerts;
  if (data.notifyDeadlines !== undefined) updates.notifyDeadlines = data.notifyDeadlines;
  if (data.notifyWeeklyDigest !== undefined) updates.notifyWeeklyDigest = data.notifyWeeklyDigest;

  const [user] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    });

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return user;
}

// ---------------------------------------------------------------------------
// Admin: user management
// ---------------------------------------------------------------------------

export async function listUsers(organizationId?: string): Promise<Array<{
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  isActive: boolean;
  lastLogin: Date | null;
  createdAt: Date;
}>> {
  const conditions = organizationId
    ? eq(users.organizationId, organizationId)
    : undefined;

  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      organizationId: users.organizationId,
      isActive: users.isActive,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(conditions);
}

export async function updateUser(
  id: string,
  data: { role?: string; isActive?: boolean; name?: string }
): Promise<{ id: string; email: string; name: string; role: string; isActive: boolean }> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.role) updates.role = data.role;
  if (data.isActive !== undefined) updates.isActive = data.isActive;
  if (data.name) updates.name = data.name;

  const [user] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
    });

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return user;
}

// ---------------------------------------------------------------------------
// Helpers for seeding
// ---------------------------------------------------------------------------

export { hashPassword };
