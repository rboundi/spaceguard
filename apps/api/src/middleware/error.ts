import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

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
          details: err.flatten().fieldErrors,
        },
        400
      );
    }

    // Unexpected errors - log and return a safe 500
    console.error("Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
}
