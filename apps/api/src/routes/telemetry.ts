import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import {
  createStreamSchema,
  updateStreamSchema,
  streamQuerySchema,
  ingestBatchSchema,
  telemetryQuerySchema,
  logEntrySchema,
  logQuerySchema,
} from "@spaceguard/shared";
import {
  createStream,
  listStreams,
  getStream,
  updateStream,
  getStreamByApiKey,
  ingestPoints,
  ingestCcsdsPacket,
  queryPoints,
  ingestLog,
  queryLogs,
} from "../services/telemetry/telemetry.service";

export const telemetryRoutes = new Hono();

import { assertUUID, assertTenant } from "../middleware/validate";

/**
 * Validates the X-API-Key header against the stream's stored key.
 * Returns the verified stream row or throws 401.
 */
async function requireStreamApiKey(streamId: string, apiKey: string | undefined) {
  if (!apiKey) {
    throw new HTTPException(401, { message: "Missing X-API-Key header" });
  }
  const stream = await getStreamByApiKey(streamId, apiKey);
  if (!stream) {
    throw new HTTPException(401, { message: "Invalid API key for this stream" });
  }
  if (stream.status === "PAUSED") {
    throw new HTTPException(409, { message: "Stream is paused" });
  }
  if (stream.status === "ERROR") {
    throw new HTTPException(409, { message: "Stream is in error state" });
  }
  return stream;
}

// ---------------------------------------------------------------------------
// Stream management
// ---------------------------------------------------------------------------

// POST /api/v1/telemetry/streams
telemetryRoutes.post(
  "/telemetry/streams",
  zValidator("json", createStreamSchema),
  async (c) => {
    const data = c.req.valid("json");
    assertTenant(c, data.organizationId);
    const stream = await createStream(data);
    return c.json(stream, 201);
  }
);

// GET /api/v1/telemetry/streams?organizationId=&protocol=&status=&page=&perPage=
telemetryRoutes.get(
  "/telemetry/streams",
  zValidator("query", streamQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    if (!query.organizationId) {
      throw new HTTPException(400, {
        message: "organizationId query parameter is required",
      });
    }
    assertTenant(c, query.organizationId);
    const result = await listStreams(query.organizationId, {
      protocol: query.protocol,
      status: query.status,
      page: query.page,
      perPage: query.perPage,
    });
    return c.json({ data: result.data, total: result.total });
  }
);

// GET /api/v1/telemetry/streams/:id
telemetryRoutes.get("/telemetry/streams/:id", async (c) => {
  const id = c.req.param("id");
  assertUUID(id, "id");
  const stream = await getStream(id);
  assertTenant(c, stream.organizationId);
  return c.json(stream);
});

// PUT /api/v1/telemetry/streams/:id
telemetryRoutes.put(
  "/telemetry/streams/:id",
  zValidator("json", updateStreamSchema),
  async (c) => {
    const id = c.req.param("id");
    assertUUID(id, "id");
    const data = c.req.valid("json");
    const existing = await getStream(id);
    assertTenant(c, existing.organizationId);
    const stream = await updateStream(id, data);
    return c.json(stream);
  }
);

// ---------------------------------------------------------------------------
// Telemetry ingestion - JSON
// ---------------------------------------------------------------------------

// POST /api/v1/telemetry/ingest/:streamId
// Body: { streamId, points: [{ time, parameterName, valueNumeric, quality }] }
// Auth: X-API-Key header must match stream.apiKey
telemetryRoutes.post("/telemetry/ingest/:streamId", async (c) => {
  const streamId = c.req.param("streamId");
  assertUUID(streamId, "streamId");

  const apiKey = c.req.header("X-API-Key");
  await requireStreamApiKey(streamId, apiKey);

  // Parse and validate the body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Request body must be valid JSON" });
  }

  const parsed = ingestBatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid ingest payload",
      cause: parsed.error,
    });
  }

  // Ensure the body streamId matches the URL param
  if (parsed.data.streamId !== streamId) {
    throw new HTTPException(400, {
      message: "Body streamId does not match URL parameter",
    });
  }

  const result = await ingestPoints(streamId, parsed.data.points);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// Telemetry ingestion - CCSDS binary
// ---------------------------------------------------------------------------

// POST /api/v1/telemetry/ingest/:streamId/ccsds
// Body: raw binary CCSDS packet stream (application/octet-stream)
// Auth: X-API-Key header must match stream.apiKey
telemetryRoutes.post("/telemetry/ingest/:streamId/ccsds", async (c) => {
  const streamId = c.req.param("streamId");
  assertUUID(streamId, "streamId");

  const apiKey = c.req.header("X-API-Key");
  await requireStreamApiKey(streamId, apiKey);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("application/octet-stream")) {
    throw new HTTPException(415, {
      message: "Content-Type must be application/octet-stream for CCSDS ingestion",
    });
  }

  const arrayBuf = await c.req.arrayBuffer();
  if (arrayBuf.byteLength === 0) {
    throw new HTTPException(400, { message: "Empty CCSDS payload" });
  }

  const buffer = Buffer.from(arrayBuf);
  const result = await ingestCcsdsPacket(streamId, buffer);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// Telemetry query
// ---------------------------------------------------------------------------

// GET /api/v1/telemetry/points?streamId=&from=&to=&parameterName=&page=&perPage=
telemetryRoutes.get(
  "/telemetry/points",
  zValidator("query", telemetryQuerySchema),
  async (c) => {
    const q = c.req.valid("query");
    const result = await queryPoints(
      q.streamId,
      new Date(q.from),
      new Date(q.to),
      q.parameterName,
      q.page,
      q.perPage
    );
    return c.json(result);
  }
);

// ---------------------------------------------------------------------------
// Ground segment logs
// ---------------------------------------------------------------------------

// POST /api/v1/telemetry/logs
telemetryRoutes.post(
  "/telemetry/logs",
  zValidator("json", logEntrySchema),
  async (c) => {
    const entry = c.req.valid("json");
    assertTenant(c, entry.organizationId);
    const log = await ingestLog(entry.organizationId, entry);
    return c.json(log, 201);
  }
);

// GET /api/v1/telemetry/logs?organizationId=&severity=&source=&from=&to=
telemetryRoutes.get(
  "/telemetry/logs",
  zValidator("query", logQuerySchema),
  async (c) => {
    const q = c.req.valid("query");
    assertTenant(c, q.organizationId);
    const result = await queryLogs(q.organizationId, {
      severity: q.severity,
      source: q.source,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      page: q.page,
      perPage: q.perPage,
    });
    return c.json(result);
  }
);
