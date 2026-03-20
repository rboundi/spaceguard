import { z } from "zod";
import { AssetType, AssetStatus, Criticality } from "../enums";

export const createAssetSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  assetType: z.nativeEnum(AssetType),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.nativeEnum(AssetStatus).default(AssetStatus.OPERATIONAL),
  criticality: z.nativeEnum(Criticality).default(Criticality.MEDIUM),
});

export const updateAssetSchema = createAssetSchema.omit({ organizationId: true }).partial();

export const assetResponseSchema = createAssetSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const assetQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  type: z.nativeEnum(AssetType).optional(),
  status: z.nativeEnum(AssetStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateAsset = z.infer<typeof createAssetSchema>;
export type UpdateAsset = z.infer<typeof updateAssetSchema>;
export type AssetResponse = z.infer<typeof assetResponseSchema>;
export type AssetQuery = z.infer<typeof assetQuerySchema>;
