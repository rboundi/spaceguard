/**
 * Tenant scoping utilities.
 *
 * Provides helpers to ensure every database query is scoped to a single
 * organization, preventing cross-tenant data leakage.
 */

import type { Context, Next, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { TokenPayload } from "../services/auth.service";

// ---------------------------------------------------------------------------
// Augment Hono context with orgId
// ---------------------------------------------------------------------------

declare module "hono" {
  interface ContextVariableMap {
    /** The resolved organization ID for the current request */
    orgId: string;
  }
}

// ---------------------------------------------------------------------------
// Middleware: extract and validate orgId from JWT or query/body
// ---------------------------------------------------------------------------

/**
 * Middleware that resolves the effective organization ID for the request.
 *
 * For non-admin users, the org ID is always taken from the JWT token.
 * For admin users, the org ID can optionally come from a query parameter
 * or request body field (for the org-switcher feature), but defaults to
 * the JWT org ID if not specified.
 *
 * After this middleware, `c.get("orgId")` is always a valid org UUID.
 */
export const tenantScopeMiddleware: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const user = c.get("user") as TokenPayload | undefined;
  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  let orgId: string;

  if (user.role === "ADMIN") {
    // Admin can specify which org to act on via query param or body
    const fromQuery = c.req.query("organizationId");
    if (fromQuery) {
      orgId = fromQuery;
    } else {
      // Try to read from already-parsed body (if POST/PUT)
      try {
        const body = await c.req.json().catch(() => null);
        orgId = (body as Record<string, unknown>)?.organizationId as string || user.organizationId;
      } catch {
        orgId = user.organizationId;
      }
    }
  } else {
    // Non-admin: always locked to their JWT org
    orgId = user.organizationId;
  }

  c.set("orgId", orgId);
  await next();
};

// ---------------------------------------------------------------------------
// Helper: get org ID from context (for use in route handlers and services)
// ---------------------------------------------------------------------------

/**
 * Extract the effective organization ID from the Hono context.
 * Throws 401 if not available (should never happen after auth middleware).
 *
 * For non-admin users, returns their JWT org ID (ignoring any client-provided value).
 * For admin users, validates the requested org ID or falls back to JWT org ID.
 */
export function getEffectiveOrgId(c: Context, requestedOrgId?: string): string {
  const user = c.get("user") as TokenPayload | undefined;
  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  // Non-admin: always use JWT org ID regardless of what the client sends
  if (user.role !== "ADMIN") {
    if (requestedOrgId && requestedOrgId !== user.organizationId) {
      throw new HTTPException(403, {
        message: "Access denied: you cannot access another organization's data",
      });
    }
    return user.organizationId;
  }

  // Admin: can use the requested org ID or fall back to their own
  return requestedOrgId || user.organizationId;
}
