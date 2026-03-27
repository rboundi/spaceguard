import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    // Hono's own HTTP exceptions (404s thrown from services, etc.)
    if (err instanceof HTTPException) {
      return c.json(
        { error: err.message },
        err.status
      );
    }

    // Zod validation errors (malformed request bodies)
    if (err instanceof ZodError) {
      return c.json(
        {
          error: "Validation failed",
          // Only return field-level errors, not the full schema shape
          details: err.flatten().fieldErrors,
        },
        400
      );
    }

    // PostgreSQL / database errors: return a generic message to the client
    // but log the full error server-side for debugging.
    const errAny = err as Record<string, unknown>;
    if (
      errAny?.code &&
      typeof errAny.code === "string" &&
      errAny.code.length === 5 // PG error codes are always 5 chars
    ) {
      console.error("Database error:", IS_PRODUCTION ? errAny.code : err);
      // Unique constraint violations get a friendlier message
      if (errAny.code === "23505") {
        return c.json({ error: "A record with this value already exists" }, 409);
      }
      // Foreign key violations
      if (errAny.code === "23503") {
        return c.json({ error: "Referenced record not found" }, 400);
      }
      return c.json({ error: "A database error occurred" }, 500);
    }

    // Unexpected errors: log full details server-side, return safe message
    if (IS_PRODUCTION) {
      console.error("Unhandled error:", (err as Error)?.message ?? "unknown");
    } else {
      console.error("Unhandled error:", err);
    }
    return c.json({ error: "Internal server error" }, 500);
  }
}
