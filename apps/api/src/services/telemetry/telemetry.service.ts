import { eq, and, gte, lte, count, sql, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { randomUUID } from "node:crypto";
import { db } from "../../db/client";
import {
  telemetryStreams,
  telemetryPoints,
  groundSegmentLogs,
} from "../../db/schema/telemetry";
import { organizations, spaceAssets } from "../../db/schema/index";
import { parseCcsdsStream } from "./ccsds-parser";
import type {
  CreateStream,
  UpdateStream,
  StreamResponse,
  IngestPoint,
  LogEntry,
} from "@spaceguard/shared";

// ---------------------------------------------------------------------------
// Response mappers
// ---------------------------------------------------------------------------

function streamToResponse(
  row: typeof telemetryStreams.$inferSelect
): StreamResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assetId: row.assetId,
    name: row.name,
    protocol: row.protocol as StreamResponse["protocol"],
    apid: row.apid ?? undefined,
    sampleRateHz: row.sampleRateHz ?? undefined,
    status: row.status as StreamResponse["status"],
    apiKey: row.apiKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Streams CRUD
// ---------------------------------------------------------------------------

export async function createStream(data: CreateStream): Promise<StreamResponse> {
  // Verify org exists
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, data.organizationId))
    .limit(1);
  if (!org) {
    throw new HTTPException(404, {
      message: `Organization ${data.organizationId} not found`,
    });
  }

  // Verify asset belongs to that org
  const [asset] = await db
    .select({ id: spaceAssets.id })
    .from(spaceAssets)
    .where(
      and(
        eq(spaceAssets.id, data.assetId),
        eq(spaceAssets.organizationId, data.organizationId)
      )
    )
    .limit(1);
  if (!asset) {
    throw new HTTPException(404, {
      message: `Asset ${data.assetId} not found in organization ${data.organizationId}`,
    });
  }

  const [row] = await db
    .insert(telemetryStreams)
    .values({
      organizationId: data.organizationId,
      assetId: data.assetId,
      name: data.name,
      protocol: data.protocol,
      apid: data.apid ?? null,
      sampleRateHz: data.sampleRateHz ?? null,
      status: data.status ?? "ACTIVE",
      apiKey: randomUUID().replace(/-/g, ""),
    })
    .returning();

  return streamToResponse(row);
}

export async function listStreams(
  organizationId: string,
  options?: {
    protocol?: string;
    status?: string;
    page?: number;
    perPage?: number;
  }
): Promise<{ data: StreamResponse[]; total: number }> {
  const page = options?.page ?? 1;
  const perPage = options?.perPage ?? 50;
  const offset = (page - 1) * perPage;

  const conditions = [eq(telemetryStreams.organizationId, organizationId)];

  if (options?.protocol) {
    conditions.push(
      eq(
        telemetryStreams.protocol,
        options.protocol as typeof telemetryStreams.$inferSelect["protocol"]
      )
    );
  }
  if (options?.status) {
    conditions.push(
      eq(
        telemetryStreams.status,
        options.status as typeof telemetryStreams.$inferSelect["status"]
      )
    );
  }

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(telemetryStreams)
      .where(where)
      .orderBy(telemetryStreams.createdAt)
      .limit(perPage)
      .offset(offset),
    db.select({ total: count() }).from(telemetryStreams).where(where),
  ]);

  return { data: rows.map(streamToResponse), total: Number(total) };
}

export async function getStream(id: string): Promise<StreamResponse> {
  const [row] = await db
    .select()
    .from(telemetryStreams)
    .where(eq(telemetryStreams.id, id))
    .limit(1);
  if (!row) {
    throw new HTTPException(404, { message: `Stream ${id} not found` });
  }
  return streamToResponse(row);
}

export async function updateStream(
  id: string,
  data: UpdateStream
): Promise<StreamResponse> {
  await getStream(id);
  const [row] = await db
    .update(telemetryStreams)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(telemetryStreams.id, id))
    .returning();
  return streamToResponse(row);
}

// ---------------------------------------------------------------------------
// Stream API-key lookup (used by ingest auth middleware)
// ---------------------------------------------------------------------------

export async function getStreamByApiKey(
  streamId: string,
  apiKey: string
): Promise<typeof telemetryStreams.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(telemetryStreams)
    .where(
      and(
        eq(telemetryStreams.id, streamId),
        eq(telemetryStreams.apiKey, apiKey)
      )
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Telemetry point ingestion
// ---------------------------------------------------------------------------

export interface IngestResult {
  inserted: number;
  streamId: string;
}

/**
 * Bulk-inserts pre-parsed telemetry points into the hypertable.
 */
export async function ingestPoints(
  streamId: string,
  points: IngestPoint[]
): Promise<IngestResult> {
  if (points.length === 0) {
    return { inserted: 0, streamId };
  }

  const rows = points.map((p) => ({
    time: new Date(p.time),
    streamId,
    parameterName: p.parameterName,
    valueNumeric: p.valueNumeric ?? null,
    valueText: p.valueText ?? null,
    quality: (p.quality ?? "GOOD") as "GOOD" | "SUSPECT" | "BAD",
  }));

  // Insert in batches of 500 to avoid parameter limit issues
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(telemetryPoints).values(batch);
    inserted += batch.length;
  }

  return { inserted, streamId };
}

/**
 * Parses a raw binary CCSDS buffer, extracts parameters from each packet,
 * and stores them as telemetry_points rows.
 *
 * For each packet the following parameters are stored:
 *   ccsds.apid           - APID as numeric value
 *   ccsds.sequence_count - packet counter
 *   ccsds.data_length    - data field length in bytes
 *   ccsds.packet_type    - "TM" or "TC" as text
 *   ccsds.is_idle        - 1 if idle packet, 0 otherwise
 *
 * If the packet has a secondary header with a CUC timestamp, that
 * timestamp is used as the point time. Otherwise current time is used.
 */
// 512 KB / 7 bytes per minimum packet ≈ 73 000 packets. Each becomes up to 8
// telemetry_points rows, so an uncapped payload could trigger ~580 000 inserts
// in one request. Cap well below that to keep ingestion predictable.
const MAX_CCSDS_PACKETS_PER_REQUEST = 5_000;

export async function ingestCcsdsPacket(
  streamId: string,
  rawBuffer: Buffer
): Promise<IngestResult> {
  const packets = parseCcsdsStream(rawBuffer);

  if (packets.length === 0) {
    return { inserted: 0, streamId };
  }

  if (packets.length > MAX_CCSDS_PACKETS_PER_REQUEST) {
    throw new HTTPException(413, {
      message: `CCSDS payload contains ${packets.length} packets which exceeds the per-request limit of ${MAX_CCSDS_PACKETS_PER_REQUEST}. Split into smaller chunks.`,
    });
  }

  const now = new Date();
  const points: Array<typeof telemetryPoints.$inferInsert> = [];

  for (const pkt of packets) {
    const time = pkt.secondaryHeader?.timestamp ?? now;

    // Each CCSDS field becomes a separate parameter row so the time-series
    // data model stays consistent with JSON-ingested data
    const baseParams: Array<[string, number | null, string | null]> = [
      ["ccsds.apid", pkt.apid, null],
      ["ccsds.sequence_count", pkt.sequenceCount, null],
      ["ccsds.data_length", pkt.dataLength, null],
      ["ccsds.packet_type", null, pkt.type],
      ["ccsds.sequence_flags", null, pkt.sequenceFlags],
      ["ccsds.is_idle", pkt.isIdle ? 1 : 0, null],
    ];

    if (pkt.secondaryHeader) {
      baseParams.push(["ccsds.coarse_time", pkt.secondaryHeader.coarseTime, null]);
      baseParams.push(["ccsds.fine_time", pkt.secondaryHeader.fineTime, null]);
    }

    for (const [name, numeric, text] of baseParams) {
      points.push({
        time,
        streamId,
        parameterName: name,
        valueNumeric: numeric,
        valueText: text,
        quality: "GOOD",
      });
    }
  }

  return ingestPoints(
    streamId,
    points.map((p) => ({
      time: (p.time as Date).toISOString(),
      parameterName: p.parameterName,
      valueNumeric: p.valueNumeric ?? undefined,
      valueText: p.valueText ?? undefined,
      quality: (p.quality as IngestPoint["quality"]) ?? "GOOD",
    }))
  );
}

// ---------------------------------------------------------------------------
// Time-series query
// ---------------------------------------------------------------------------

export interface TelemetryDataPoint {
  time: string;
  parameterName: string;
  valueNumeric: number | null;
  valueText: string | null;
  quality: string;
}

export interface TelemetryQueryResult {
  streamId: string;
  parameterName: string | undefined;
  from: string;
  to: string;
  downsampled: boolean;
  bucketInterval: string | null;
  data: TelemetryDataPoint[];
  total: number;
}

const MS_PER_HOUR = 3_600_000;
const MS_24H = 24 * MS_PER_HOUR;

/**
 * Queries telemetry_points for a stream within a time range.
 *
 * When the requested range exceeds 24 hours the results are downsampled
 * using TimescaleDB time_bucket with a 1-hour bucket. Numeric values are
 * averaged per bucket; text values pick the most recent value.
 *
 * When the range is <= 24 hours raw points are returned ordered by time ASC.
 */
export async function queryPoints(
  streamId: string,
  from: Date,
  to: Date,
  parameterName?: string,
  page = 1,
  perPage = 100
): Promise<TelemetryQueryResult> {
  // Verify stream exists
  await getStream(streamId);

  const rangeMs = to.getTime() - from.getTime();
  if (rangeMs < 0) {
    throw new HTTPException(400, {
      message: "'from' must not be after 'to'",
    });
  }

  // Zero-width range: return empty result immediately without hitting DB
  if (rangeMs === 0) {
    return { streamId, parameterName, from: from.toISOString(), to: to.toISOString(), downsampled: false, bucketInterval: null, data: [], total: 0 };
  }

  const needsDownsample = rangeMs > MS_24H;
  const offset = (page - 1) * perPage;

  let data: TelemetryDataPoint[];
  let total: number;

  if (needsDownsample) {
    // Choose bucket size: 1h for ranges up to ~30 days, 1 day beyond that
    const bucketInterval = rangeMs > 30 * 24 * MS_PER_HOUR ? "1 day" : "1 hour";

    // Build optional parameter filter clause
    const paramFilter = parameterName
      ? sql` AND parameter_name = ${parameterName}`
      : sql``;

    // Raw SQL for TimescaleDB time_bucket aggregation.
    // Downsampled results are bounded (e.g. 7d @ 1h = 168 buckets × N params),
    // so we skip pagination and return all rows in one shot.
    const DOWNSAMPLE_LIMIT = 10_000; // safety cap; never hit in practice
    const rows = await db.execute<{
      bucket: Date;
      parameter_name: string;
      avg_numeric: string | null;
      last_text: string | null;
      quality: string;
    }>(sql`
      SELECT
        time_bucket(${bucketInterval}::interval, time) AS bucket,
        parameter_name,
        AVG(value_numeric)::float8 AS avg_numeric,
        (ARRAY_AGG(value_text ORDER BY time DESC))[1] AS last_text,
        (ARRAY_AGG(quality ORDER BY time DESC))[1] AS quality
      FROM telemetry_points
      WHERE stream_id = ${streamId}
        AND time >= ${from.toISOString()}::timestamptz
        AND time <= ${to.toISOString()}::timestamptz
        ${paramFilter}
      GROUP BY bucket, parameter_name
      ORDER BY bucket ASC, parameter_name ASC
      LIMIT ${DOWNSAMPLE_LIMIT}
    `);

    data = rows.map((r) => ({
      time: (r.bucket as Date).toISOString(),
      parameterName: r.parameter_name,
      valueNumeric: r.avg_numeric !== null ? Number(r.avg_numeric) : null,
      valueText: r.last_text ?? null,
      quality: r.quality ?? "GOOD",
    }));
    total = data.length;

    return {
      streamId,
      parameterName,
      from: from.toISOString(),
      to: to.toISOString(),
      downsampled: true,
      bucketInterval,
      data,
      total,
    };
  }

  // Raw points query for ranges <= 24 hours
  const conditions = [
    eq(telemetryPoints.streamId, streamId),
    gte(telemetryPoints.time, from),
    lte(telemetryPoints.time, to),
  ];
  if (parameterName) {
    conditions.push(eq(telemetryPoints.parameterName, parameterName));
  }

  const where = and(...conditions);

  const [rows, [{ total: rawTotal }]] = await Promise.all([
    db
      .select()
      .from(telemetryPoints)
      .where(where)
      .orderBy(telemetryPoints.time)
      .limit(perPage)
      .offset(offset),
    db.select({ total: count() }).from(telemetryPoints).where(where),
  ]);

  total = Number(rawTotal);
  data = rows.map((r) => ({
    time: r.time.toISOString(),
    parameterName: r.parameterName,
    valueNumeric: r.valueNumeric ?? null,
    valueText: r.valueText ?? null,
    quality: r.quality ?? "GOOD",
  }));

  return {
    streamId,
    parameterName,
    from: from.toISOString(),
    to: to.toISOString(),
    downsampled: false,
    bucketInterval: null,
    data,
    total,
  };
}

// ---------------------------------------------------------------------------
// Ground segment logs
// ---------------------------------------------------------------------------

export interface LogResponse {
  id: string;
  organizationId: string;
  source: string;
  severity: string;
  message: string;
  structuredData: Record<string, unknown> | null;
  timestamp: string;
  createdAt: string;
}

function logToResponse(row: typeof groundSegmentLogs.$inferSelect): LogResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    source: row.source,
    severity: row.severity,
    message: row.message,
    structuredData: (row.structuredData as Record<string, unknown>) ?? null,
    timestamp: row.timestamp.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function ingestLog(
  orgId: string,
  entry: LogEntry
): Promise<LogResponse> {
  // Verify org exists
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    throw new HTTPException(404, { message: `Organization ${orgId} not found` });
  }

  const [row] = await db
    .insert(groundSegmentLogs)
    .values({
      organizationId: orgId,
      source: entry.source,
      severity: entry.severity,
      message: entry.message,
      structuredData: entry.structuredData ?? null,
      timestamp: new Date(entry.timestamp),
    })
    .returning();

  return logToResponse(row);
}

export async function queryLogs(
  organizationId: string,
  options?: {
    severity?: string;
    source?: string;
    from?: Date;
    to?: Date;
    page?: number;
    perPage?: number;
  }
): Promise<{ data: LogResponse[]; total: number }> {
  const page = options?.page ?? 1;
  const perPage = options?.perPage ?? 50;
  const offset = (page - 1) * perPage;

  const conditions = [eq(groundSegmentLogs.organizationId, organizationId)];

  if (options?.severity) {
    conditions.push(
      eq(
        groundSegmentLogs.severity,
        options.severity as typeof groundSegmentLogs.$inferSelect["severity"]
      )
    );
  }
  if (options?.source) {
    conditions.push(eq(groundSegmentLogs.source, options.source));
  }
  if (options?.from) {
    conditions.push(gte(groundSegmentLogs.timestamp, options.from));
  }
  if (options?.to) {
    conditions.push(lte(groundSegmentLogs.timestamp, options.to));
  }

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(groundSegmentLogs)
      .where(where)
      .orderBy(desc(groundSegmentLogs.timestamp))
      .limit(perPage)
      .offset(offset),
    db.select({ total: count() }).from(groundSegmentLogs).where(where),
  ]);

  return { data: rows.map(logToResponse), total: Number(total) };
}
