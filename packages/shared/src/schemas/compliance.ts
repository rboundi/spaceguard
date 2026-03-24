import { z } from "zod";
import { Regulation, ComplianceStatus } from "../enums";

export const complianceRequirementSchema = z.object({
  id: z.string().uuid(),
  regulation: z.nativeEnum(Regulation),
  articleReference: z.string(),
  title: z.string(),
  description: z.string(),
  evidenceGuidance: z.string(),
  category: z.string(),
  applicabilityNotes: z.string().optional(),
  createdAt: z.string().datetime(),
});

export const requirementQuerySchema = z.object({
  regulation: z.nativeEnum(Regulation).optional(),
  category: z.string().optional(),
});

export const createMappingSchema = z.object({
  organizationId: z.string().uuid(),
  assetId: z.string().uuid().nullable().optional(),
  requirementId: z.string().uuid(),
  status: z.nativeEnum(ComplianceStatus).default(ComplianceStatus.NOT_ASSESSED),
  // Reasonable upper bounds match the DB column types (text is unlimited in PG,
  // but we enforce limits at the API boundary to prevent huge writes).
  evidenceDescription: z.string().max(10000).optional(),
  responsiblePerson: z.string().max(255).optional(),
  nextReviewDate: z.string().date().optional(),
  notes: z.string().max(10000).optional(),
});

export const updateMappingSchema = createMappingSchema
  .omit({ organizationId: true, requirementId: true })
  .partial();

export const mappingResponseSchema = createMappingSchema.extend({
  id: z.string().uuid(),
  lastAssessed: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const mappingQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  requirementId: z.string().uuid().optional(),
  status: z.nativeEnum(ComplianceStatus).optional(),
});

export const dashboardResponseSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string() }),
  overallScore: z.number(),
  totalRequirements: z.number(),
  byStatus: z.record(z.nativeEnum(ComplianceStatus), z.number()),
  byCategory: z.array(
    z.object({
      category: z.string(),
      total: z.number(),
      compliant: z.number(),
      score: z.number(),
    })
  ),
  gaps: z.array(
    z.object({
      requirementId: z.string(),
      title: z.string(),
      category: z.string(),
      status: z.nativeEnum(ComplianceStatus),
      affectedAssets: z.array(z.string()),
    })
  ),
  assetsSummary: z.object({
    total: z.number(),
    byType: z.record(z.string(), z.number()),
    byCriticality: z.record(z.string(), z.number()),
  }),
});

export type ComplianceRequirement = z.infer<typeof complianceRequirementSchema>;
export type CreateMapping = z.infer<typeof createMappingSchema>;
export type UpdateMapping = z.infer<typeof updateMappingSchema>;
export type MappingResponse = z.infer<typeof mappingResponseSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
