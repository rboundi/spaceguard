import { z } from "zod";
import { AssetType, AssetStatus, Criticality, AssetSegment, LifecyclePhase } from "../enums";

export const createAssetSchema = z.object({
  organizationId: z.string().uuid(),
  parentAssetId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  assetType: z.nativeEnum(AssetType),
  segment: z.nativeEnum(AssetSegment).nullable().optional(),
  description: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.nativeEnum(AssetStatus).default(AssetStatus.OPERATIONAL),
  criticality: z.nativeEnum(Criticality).default(Criticality.MEDIUM),
  lifecyclePhase: z.nativeEnum(LifecyclePhase).default(LifecyclePhase.PHASE_E_OPERATIONS),
  endOfLifeDate: z.string().nullable().optional(),
}).strict();

export const updateAssetSchema = createAssetSchema
  .omit({ organizationId: true })
  .partial();

export const assetResponseSchema = createAssetSchema.extend({
  id: z.string().uuid(),
  parentAssetId: z.string().uuid().nullable(),
  segment: z.nativeEnum(AssetSegment).nullable(),
  lifecyclePhase: z.nativeEnum(LifecyclePhase).nullable(),
  lifecyclePhaseEnteredAt: z.string().datetime().nullable(),
  endOfLifeDate: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Tree response: asset with nested children array (recursive type, no Zod
// schema needed - validated at the service layer and serialised as JSON)
export interface AssetTreeNode extends AssetResponse {
  children: AssetTreeNode[];
}

export const assetQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  type: z.nativeEnum(AssetType).optional(),
  segment: z.nativeEnum(AssetSegment).optional(),
  status: z.nativeEnum(AssetStatus).optional(),
  parentAssetId: z.string().uuid().optional(),
  topLevelOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateAsset = z.infer<typeof createAssetSchema>;
export type UpdateAsset = z.infer<typeof updateAssetSchema>;
export type AssetResponse = z.infer<typeof assetResponseSchema>;
export type AssetQuery = z.infer<typeof assetQuerySchema>;
