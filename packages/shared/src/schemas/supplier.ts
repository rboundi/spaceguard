import { z } from "zod";
import { Criticality } from "../enums";

export enum SupplierType {
  COMPONENT_MANUFACTURER = "COMPONENT_MANUFACTURER",
  GROUND_STATION_OPERATOR = "GROUND_STATION_OPERATOR",
  LAUNCH_PROVIDER = "LAUNCH_PROVIDER",
  CLOUD_PROVIDER = "CLOUD_PROVIDER",
  SOFTWARE_VENDOR = "SOFTWARE_VENDOR",
  INTEGRATION_PARTNER = "INTEGRATION_PARTNER",
  DATA_RELAY_PROVIDER = "DATA_RELAY_PROVIDER",
}

export const supplierTypeLabels: Record<SupplierType, string> = {
  [SupplierType.COMPONENT_MANUFACTURER]: "Component Manufacturer",
  [SupplierType.GROUND_STATION_OPERATOR]: "Ground Station Operator",
  [SupplierType.LAUNCH_PROVIDER]: "Launch Provider",
  [SupplierType.CLOUD_PROVIDER]: "Cloud Provider",
  [SupplierType.SOFTWARE_VENDOR]: "Software Vendor",
  [SupplierType.INTEGRATION_PARTNER]: "Integration Partner",
  [SupplierType.DATA_RELAY_PROVIDER]: "Data Relay Provider",
};

export const securityAssessmentSchema = z.object({
  lastAssessed: z.string().nullable().optional(),
  nextReview: z.string().nullable().optional(),
  iso27001Certified: z.boolean().default(false),
  soc2Certified: z.boolean().default(false),
  nis2Compliant: z.boolean().default(false),
  riskScore: z.number().int().min(1).max(10).default(5),
  notes: z.string().max(2000).nullable().optional(),
});

export const createSupplierSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: z.nativeEnum(SupplierType),
  country: z.string().min(2).max(2),
  criticality: z.nativeEnum(Criticality).default(Criticality.MEDIUM),
  description: z.string().max(2000).optional(),
  contactInfo: z.record(z.unknown()).optional(),
  assetsSupplied: z.array(z.string().uuid()).optional(),
  securityAssessment: securityAssessmentSchema.optional(),
});

export const updateSupplierSchema = createSupplierSchema
  .omit({ organizationId: true })
  .partial();

export const supplierResponseSchema = createSupplierSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const supplierQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  type: z.nativeEnum(SupplierType).optional(),
  criticality: z.nativeEnum(Criticality).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

export type SecurityAssessment = z.infer<typeof securityAssessmentSchema>;
export type CreateSupplier = z.infer<typeof createSupplierSchema>;
export type UpdateSupplier = z.infer<typeof updateSupplierSchema>;
export type SupplierResponse = z.infer<typeof supplierResponseSchema>;
export type SupplierQuery = z.infer<typeof supplierQuerySchema>;
