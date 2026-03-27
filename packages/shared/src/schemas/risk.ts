import { z } from "zod";

export const riskBreakdownSchema = z.object({
  compliance: z.number().min(0).max(100),
  threat: z.number().min(0).max(100),
  alerts: z.number().min(0).max(100),
  supplyChain: z.number().min(0).max(100),
  config: z.number().min(0).max(100),
});

export type RiskBreakdown = z.infer<typeof riskBreakdownSchema>;

export const riskTrendSchema = z.enum(["IMPROVING", "STABLE", "DEGRADING"]);
export type RiskTrend = z.infer<typeof riskTrendSchema>;

export const riskScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  breakdown: riskBreakdownSchema,
  trend: riskTrendSchema,
  topRisks: z.array(z.string()),
});

export type RiskScore = z.infer<typeof riskScoreSchema>;

export const assetRiskResponseSchema = z.object({
  assetId: z.string().uuid(),
  assetName: z.string(),
  assetType: z.string(),
  criticality: z.string(),
  risk: riskScoreSchema,
});

export type AssetRiskResponse = z.infer<typeof assetRiskResponseSchema>;

export const orgRiskResponseSchema = z.object({
  organizationId: z.string().uuid(),
  overall: z.number().min(0).max(100),
  breakdown: riskBreakdownSchema,
  trend: riskTrendSchema,
  topRisks: z.array(z.string()),
  assetCount: z.number(),
  highRiskAssetCount: z.number(),
});

export type OrgRiskResponse = z.infer<typeof orgRiskResponseSchema>;

export const riskOverviewResponseSchema = z.object({
  organization: orgRiskResponseSchema,
  assets: z.array(assetRiskResponseSchema),
  history: z.array(
    z.object({
      date: z.string(),
      score: z.number(),
    }),
  ),
});

export type RiskOverviewResponse = z.infer<typeof riskOverviewResponseSchema>;
