import type { Context, Next, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { validateToken, type TokenPayload } from "../services/auth.service";

// ---------------------------------------------------------------------------
// Augment Hono context variables
// ---------------------------------------------------------------------------

// Declaration merging for Hono variable map so c.get("user") is typed.
declare module "hono" {
  interface ContextVariableMap {
    user: TokenPayload;
  }
}

// ---------------------------------------------------------------------------
// Core auth middleware: validates Bearer token and attaches user to context
// ---------------------------------------------------------------------------

export const authMiddleware: MiddlewareHandler = async (c: Context, next: Next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);
  const payload = await validateToken(token);

  c.set("user", payload);

  // Also set the actor header for the audit middleware so it picks up the real user
  // The audit middleware reads x-actor; we inject it from the JWT rather than trusting
  // a client-provided header.
  c.req.raw.headers.set("x-actor", payload.email);

  await next();
};

// ---------------------------------------------------------------------------
// Role guard factory: restricts access to users with given roles
// ---------------------------------------------------------------------------

export function requireRole(...roles: string[]): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Authentication required" });
    }
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, {
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    await next();
  };
}

// ---------------------------------------------------------------------------
// Convenience role guards
// ---------------------------------------------------------------------------

/** Only ADMIN can access */
export const adminOnly = requireRole("ADMIN");

/** ADMIN or OPERATOR can access */
export const operatorOrAbove = requireRole("ADMIN", "OPERATOR");

/** Any authenticated user can access (explicit guard, same as authMiddleware) */
export const anyAuthenticated = requireRole("ADMIN", "OPERATOR", "VIEWER", "AUDITOR");

/** ADMIN or AUDITOR can access audit/report features */
export const auditorOrAdmin = requireRole("ADMIN", "AUDITOR");
