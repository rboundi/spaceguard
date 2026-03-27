/**
 * Production-ready security headers middleware.
 *
 * Hono's built-in secureHeaders() covers the basics, but we override
 * and extend it with a more restrictive CSP and HSTS for production.
 */

import type { Context, Next, MiddlewareHandler } from "hono";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const securityHeadersMiddleware: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  await next();

  // Prevent MIME-type sniffing
  c.header("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  c.header("X-Frame-Options", "DENY");

  // XSS filter (legacy, but still useful for older browsers)
  c.header("X-XSS-Protection", "1; mode=block");

  // Referrer policy: send origin only on cross-origin requests
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");

  // Do not allow the site to be embedded
  c.header("X-Permitted-Cross-Domain-Policies", "none");

  // Content Security Policy: API only serves JSON, so very restrictive
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'"
  );

  // HSTS: only in production (browsers reject localhost with HSTS)
  if (IS_PRODUCTION) {
    c.header(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  // Prevent caching of authenticated responses
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  c.header("Pragma", "no-cache");
};
