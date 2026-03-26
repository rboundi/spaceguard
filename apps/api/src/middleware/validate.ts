/**
 * Shared validation utilities used across route handlers.
 */

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Assert that `value` is a valid UUID v4 string.
 * Throws a 400 HTTPException when the check fails.
 */
export function assertUUID(value: string, label = "id"): void {
  if (!UUID_RE.test(value)) {
    throw new HTTPException(400, { message: `Invalid ${label} format` });
  }
}

/**
 * Verify the authenticated user belongs to the requested organization.
 *
 * In the current MVP, users with the ADMIN role are allowed to access any
 * organization's data (required by the org-switcher UI). Non-admin users
 * are restricted to their own JWT organizationId.
 *
 * Call this in any route that accepts an organizationId from the client.
 */
export function assertTenant(c: Context, requestedOrgId: string): void {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  // Admins can access any organization (org-switcher use case)
  if (user.role === "ADMIN") return;
  if (user.organizationId !== requestedOrgId) {
    throw new HTTPException(403, {
      message: "Access denied: you cannot access another organization's data",
    });
  }
}
