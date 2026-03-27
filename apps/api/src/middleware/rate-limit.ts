/**
 * In-memory rate limiting middleware for Hono.
 *
 * Tracks request counts per key (org ID or IP) using a sliding window.
 * In production this should be backed by Redis; the in-memory store is
 * sufficient for single-process deployments and local development.
 */

import type { Context, Next, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

// ---------------------------------------------------------------------------
// Sliding-window counter store
// ---------------------------------------------------------------------------

interface WindowEntry {
  count: number;
  resetAt: number; // epoch ms
}

const store = new Map<string, WindowEntry>();

// Garbage-collect expired entries every 60 s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000).unref();

function hit(key: string, windowMs: number, limit: number): { allowed: boolean; remaining: number; retryAfterS: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > limit) {
    const retryAfterS = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterS };
  }

  return { allowed: true, remaining: limit - entry.count, retryAfterS: 0 };
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

interface RateLimitOptions {
  /** Maximum number of requests in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Extract the key from the request (defaults to org ID or IP) */
  keyFn?: (c: Context) => string;
  /** Optional prefix for the store key to separate different limiters */
  prefix?: string;
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const rawKey = opts.keyFn
      ? opts.keyFn(c)
      : extractOrgOrIp(c);
    const storeKey = opts.prefix ? `${opts.prefix}:${rawKey}` : rawKey;

    const result = hit(storeKey, opts.windowMs, opts.limit);

    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));

    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterS));
      throw new HTTPException(429, {
        message: `Rate limit exceeded. Try again in ${result.retryAfterS}s`,
      });
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// Key extractors
// ---------------------------------------------------------------------------

function extractOrgOrIp(c: Context): string {
  try {
    const user = c.get("user");
    if (user?.organizationId) return `org:${user.organizationId}`;
  } catch {
    // user not set yet (pre-auth routes)
  }
  return `ip:${extractIp(c)}`;
}

export function extractIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// Pre-configured limiters
// ---------------------------------------------------------------------------

/** General API: 1000 req/min per org */
export const apiRateLimit = rateLimit({
  limit: 1000,
  windowMs: 60_000,
  prefix: "api",
});

/** Telemetry ingestion: 10 000 points/min per org */
export const telemetryRateLimit = rateLimit({
  limit: 10_000,
  windowMs: 60_000,
  prefix: "telemetry",
});

/** Report generation: 10/hour per org */
export const reportRateLimit = rateLimit({
  limit: 10,
  windowMs: 60 * 60 * 1000,
  prefix: "report",
});

/** Auth attempts: 10/min per IP */
export const authRateLimit = rateLimit({
  limit: 10,
  windowMs: 60_000,
  prefix: "auth",
  keyFn: (c) => `ip:${extractIp(c)}`,
});
