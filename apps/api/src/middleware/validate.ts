/**
 * Shared validation utilities used across route handlers.
 */

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
