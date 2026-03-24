/**
 * Admin SPARTA routes
 *
 * POST /admin/sparta/import   - upload a STIX 2.1 JSON bundle
 * POST /admin/sparta/fetch    - fetch latest from sparta.aerospace.org
 * GET  /admin/sparta/status   - current SPARTA data status and import history
 */

import { Hono } from "hono";
import {
  importSpartaBundle,
  fetchFromServer,
  getSpartaStatus,
} from "../services/sparta.service";
import { spartaFetchRequestSchema } from "@spaceguard/shared";

export const adminSpartaRoutes = new Hono();

// ---------------------------------------------------------------------------
// POST /admin/sparta/import
// ---------------------------------------------------------------------------
// Accepts either:
//   - multipart/form-data with a "file" field containing the JSON bundle
//   - application/json with the bundle as the request body

adminSpartaRoutes.post("/admin/sparta/import", async (c) => {
  const contentType = c.req.header("content-type") ?? "";

  let rawBundle: unknown;
  let fileName: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!file || typeof file === "string") {
      return c.json({ error: "Missing 'file' field in multipart upload" }, 400);
    }
    fileName = (file as File).name;
    const text = await (file as File).text();
    try {
      rawBundle = JSON.parse(text);
    } catch {
      return c.json({ error: "Uploaded file is not valid JSON" }, 400);
    }
  } else {
    // Assume JSON body
    try {
      rawBundle = await c.req.json();
    } catch {
      return c.json({ error: "Request body is not valid JSON" }, 400);
    }
  }

  const diff = await importSpartaBundle(rawBundle, {
    source: "FILE_UPLOAD",
    fileName,
  });

  return c.json(diff, 200);
});

// ---------------------------------------------------------------------------
// POST /admin/sparta/fetch
// ---------------------------------------------------------------------------
// Fetches the latest STIX bundle from the official SPARTA download endpoint.
// Optionally accepts { url: "..." } to override the default endpoint.

adminSpartaRoutes.post("/admin/sparta/fetch", async (c) => {
  let url: string | undefined;

  // Check if there's a JSON body with a custom URL
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = await c.req.json();
      const parsed = spartaFetchRequestSchema.safeParse(body);
      if (parsed.success) {
        url = parsed.data.url;
      }
    } catch {
      // No body or invalid JSON is fine, use default URL
    }
  }

  const diff = await fetchFromServer(url);
  return c.json(diff, 200);
});

// ---------------------------------------------------------------------------
// GET /admin/sparta/status
// ---------------------------------------------------------------------------

adminSpartaRoutes.get("/admin/sparta/status", async (c) => {
  const status = await getSpartaStatus();
  return c.json(status, 200);
});
