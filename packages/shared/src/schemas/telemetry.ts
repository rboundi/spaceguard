import { z } from "zod";
import {
  StreamProtocol,
  StreamStatus,
  TelemetryQuality,
  LogSeverity,
} from "../enums";

// ---------------------------------------------------------------------------
// Telemetry Streams
// ---------------------------------------------------------------------------

export const createStreamSchema = z.object({
  organizationId: z.string().uuid(),
  assetId: z.string().uuid(),
  name: z.string().min(1).max(255),
  protocol: z.nativeEnum(StreamProtocol),
  apid: z.number().int().min(0).max(2047).optional(),
  sampleRateHz: z.number().positive().optional(),
  status: z.nativeEnum(StreamStatus).default(StreamStatus.ACTIVE),
});

export const updateStreamSchema = createStreamSchema
  .omit({ organizationId: true, assetId: true })
  .partial();

export const streamResponseSchema = createStreamSchema.extend({
  id: z.string().uuid(),
  apiKey: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const streamQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  protocol: z.nativeEnum(StreamProtocol).optional(),
  status: z.nativeEnum(StreamStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateStream = z.infer<typeof createStreamSchema>;
export type UpdateStream = z.infer<typeof updateStreamSchema>;
export type StreamResponse = z.infer<typeof streamResponseSchema>;
export type StreamQuery = z.infer<typeof streamQuerySchema>;

// ---------------------------------------------------------------------------
// Telemetry Points (ingestion)
// ---------------------------------------------------------------------------

export const ingestPointSchema = z.object({
  time: z.string().datetime({ offset: true }),
  parameterName: z.string().min(1).max(255),
  valueNumeric: z.number().optional(),
  valueText: z.string().max(1024).optional(),
  quality: z.nativeEnum(TelemetryQuality).default(TelemetryQuality.GOOD),
});

export const ingestBatchSchema = z.object({
  streamId: z.string().uuid(),
  points: z.array(ingestPointSchema).min(1).max(1000),
});

export const telemetryQuerySchema = z
  .object({
    streamId: z.string().uuid(),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    parameterName: z.string().max(255).optional(),
    page: z.coerce.number().int().positive().default(1),
    // 5000 per param is enough for 1Hz over 1h (3600 pts) or 10Hz over 8 min
    perPage: z.coerce.number().int().positive().max(5000).default(100),
  })
  .refine((d) => new Date(d.from) <= new Date(d.to), {
    message: "'from' must not be after 'to'",
    path: ["from"],
  });

export const telemetryPointResponseSchema = ingestPointSchema.extend({
  streamId: z.string().uuid(),
});

export type IngestPoint = z.infer<typeof ingestPointSchema>;
export type IngestBatch = z.infer<typeof ingestBatchSchema>;
export type TelemetryQuery = z.infer<typeof telemetryQuerySchema>;
export type TelemetryPointResponse = z.infer<typeof telemetryPointResponseSchema>;

// ---------------------------------------------------------------------------
// Ground Segment Logs
// ---------------------------------------------------------------------------

export const logEntrySchema = z.object({
  organizationId: z.string().uuid(),
  source: z.string().min(1).max(255),
  severity: z.nativeEnum(LogSeverity),
  message: z.string().min(1).max(10000),
  structuredData: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime({ offset: true }),
});

export const logQuerySchema = z
  .object({
    organizationId: z.string().uuid(),
    severity: z.nativeEnum(LogSeverity).optional(),
    // max(255) mirrors the varchar(255) column; prevents oversized query predicates
    source: z.string().max(255).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(100).default(50),
  })
  .refine(
    (d) => !d.from || !d.to || new Date(d.from) <= new Date(d.to),
    { message: "'from' must not be after 'to'", path: ["from"] }
  );

export const logResponseSchema = logEntrySchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;
export type LogQuery = z.infer<typeof logQuerySchema>;
export type LogResponse = z.infer<typeof logResponseSchema>;
