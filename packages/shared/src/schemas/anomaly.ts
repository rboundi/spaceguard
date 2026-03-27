import { z } from "zod";

// ---------------------------------------------------------------------------
// Baseline response (what the API returns)
// ---------------------------------------------------------------------------

export const baselineResponseSchema = z.object({
  id: z.string().uuid(),
  streamId: z.string().uuid(),
  parameterName: z.string(),
  mean: z.number(),
  stdDeviation: z.number(),
  minValue: z.number(),
  maxValue: z.number(),
  sampleCount: z.number().int(),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BaselineResponse = z.infer<typeof baselineResponseSchema>;

// ---------------------------------------------------------------------------
// Update baseline (operator manual override)
// ---------------------------------------------------------------------------

export const updateBaselineSchema = z.object({
  mean: z.number().optional(),
  stdDeviation: z.number().min(0).optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
}).strict();

export type UpdateBaseline = z.infer<typeof updateBaselineSchema>;

// ---------------------------------------------------------------------------
// Anomaly stats response
// ---------------------------------------------------------------------------

export const anomalyStatsResponseSchema = z.object({
  streamId: z.string().uuid(),
  totalBaselines: z.number().int(),
  anomalyRate: z.number(),
  topAnomalousParameters: z.array(
    z.object({
      parameterName: z.string(),
      anomalyCount: z.number().int(),
      lastZScore: z.number(),
    })
  ),
  learningMode: z.boolean(),
  learningModeUntil: z.string().datetime().nullable(),
});

export type AnomalyStatsResponse = z.infer<typeof anomalyStatsResponseSchema>;

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

export const baselineQuerySchema = z.object({
  streamId: z.string().uuid(),
});

export type BaselineQuery = z.infer<typeof baselineQuerySchema>;

export const anomalyStatsQuerySchema = z.object({
  streamId: z.string().uuid(),
});

export type AnomalyStatsQuery = z.infer<typeof anomalyStatsQuerySchema>;
