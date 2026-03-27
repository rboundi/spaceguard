/**
 * Input sanitization helpers.
 *
 * - sanitizeString: strips HTML/script tags to prevent stored XSS
 * - jsonbSizeGuard: middleware that rejects bodies with JSONB fields > 1 MB
 */

import type { Context, Next, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

// ---------------------------------------------------------------------------
// XSS sanitizer for plain-text string fields
// ---------------------------------------------------------------------------

const HTML_TAG_RE = /<\/?[^>]+(>|$)/g;

/**
 * Strip HTML tags from a string. This is a lightweight defense-in-depth
 * measure; the primary XSS protection comes from the frontend escaping
 * output and the API returning Content-Type: application/json.
 */
export function sanitizeString(input: string): string {
  return input.replace(HTML_TAG_RE, "").trim();
}

/**
 * Recursively sanitize all string values in a plain object/array.
 * Returns a new object (does not mutate the original).
 */
export function sanitizeObject<T>(obj: T): T {
  if (typeof obj === "string") {
    return sanitizeString(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value);
    }
    return result as T;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// JSONB size guard
// ---------------------------------------------------------------------------

const MAX_JSONB_BYTES = 1024 * 1024; // 1 MB

/**
 * Middleware that checks the raw body size of JSON requests and
 * rejects any JSONB-like field (metadata, parameters, data, config,
 * details) that exceeds 1 MB when serialized.
 */
export const jsonbSizeGuard: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  // Only check JSON bodies on mutation methods
  if (!["POST", "PUT", "PATCH"].includes(c.req.method)) {
    return next();
  }

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return next();
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    // Let downstream Zod validation handle malformed JSON
    return next();
  }

  // Check known JSONB fields
  const jsonbFields = ["metadata", "parameters", "data", "config", "details", "layout"];
  for (const field of jsonbFields) {
    if (body[field] !== undefined && body[field] !== null) {
      const size = JSON.stringify(body[field]).length;
      if (size > MAX_JSONB_BYTES) {
        throw new HTTPException(413, {
          message: `Field "${field}" exceeds maximum size of 1 MB`,
        });
      }
    }
  }

  await next();
};
