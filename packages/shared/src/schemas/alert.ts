import { z } from "zod";
import { AlertSeverity, AlertStatus } from "../enums";

// ---------------------------------------------------------------------------
// Alert response (what the API returns)
// ---------------------------------------------------------------------------

export const alertResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  streamId: z.string().uuid().nullable(),
  ruleId: z.string(),
  severity: z.nativeEnum(AlertSeverity),
  title: z.string(),
  description: z.string(),
  status: z.nativeEnum(AlertStatus),
  spartaTactic: z.string().nullable(),
  spartaTechnique: z.string().nullable(),
  affectedAssetId: z.string().uuid().nullable(),
  triggeredAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  resolvedBy: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Create alert (used internally by the detection engine, exposed for testing)
// ---------------------------------------------------------------------------

export const createAlertSchema = z.object({
  organizationId: z.string().uuid(),
  streamId: z.string().uuid().optional(),
  ruleId: z.string().min(1).max(64),
  severity: z.nativeEnum(AlertSeverity),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  spartaTactic: z.string().max(100).optional(),
  spartaTechnique: z.string().max(100).optional(),
  affectedAssetId: z.string().uuid().optional(),
  triggeredAt: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

// ---------------------------------------------------------------------------
// Update alert (status transitions, resolution tracking)
// ---------------------------------------------------------------------------

export const updateAlertSchema = z.object({
  status: z.nativeEnum(AlertStatus).optional(),
  resolvedBy: z.string().max(255).optional(),
  // Callers may provide additional notes via metadata merge
  metadata: z.record(z.unknown()).optional(),
}).strict();

// ---------------------------------------------------------------------------
// Query params for listing alerts
// ---------------------------------------------------------------------------

export const alertQuerySchema = z.object({
  organizationId: z.string().uuid(),
  status: z.nativeEnum(AlertStatus).optional(),
  severity: z.nativeEnum(AlertSeverity).optional(),
  streamId: z.string().uuid().optional(),
  affectedAssetId: z.string().uuid().optional(),
  ruleId: z.string().max(64).optional(),
  spartaTactic: z.string().max(100).optional(),
  spartaTechnique: z.string().max(100).optional(),
  // ISO date strings for time-window filtering
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type AlertResponse = z.infer<typeof alertResponseSchema>;
export type CreateAlert = z.infer<typeof createAlertSchema>;
export type UpdateAlert = z.infer<typeof updateAlertSchema>;
export type AlertQuery = z.infer<typeof alertQuerySchema>;
