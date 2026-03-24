import { z } from "zod";
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentNis2Classification,
  IncidentReportType,
} from "../enums";

// ---------------------------------------------------------------------------
// Sub-schemas (used in jsonb fields)
// ---------------------------------------------------------------------------

/** One SPARTA tactic/technique pair attached to an incident */
export const spartaTechniqueEntrySchema = z.object({
  tactic: z.string().min(1).max(100),
  technique: z.string().min(1).max(100),
});

/** A single entry in the incident timeline */
export const timelineEntrySchema = z.object({
  timestamp: z.string().datetime({ offset: true }),
  event: z.string().min(1).max(2000),
  actor: z.string().max(255).optional(),
});

/**
 * Structured content for NIS2 Article 23 regulatory reports.
 * Fields required vary by report type but the schema is shared.
 */
export const nis2ReportContentSchema = z.object({
  // Incident basics (all report types)
  incidentTitle: z.string(),
  incidentId: z.string().uuid(),
  reportingOrganization: z.string(),
  reportingDate: z.string().datetime({ offset: true }),
  reportType: z.nativeEnum(IncidentReportType),

  // Classification
  nis2Classification: z.nativeEnum(IncidentNis2Classification),
  sector: z.string().default("space"),
  affectedCountries: z.array(z.string()).default([]),

  // Incident description
  incidentDescription: z.string(),
  rootCause: z.string().optional(),
  attackVector: z.string().optional(),
  spartaTechniques: z.array(spartaTechniqueEntrySchema).default([]),

  // Impact
  affectedServices: z.array(z.string()).default([]),
  affectedAssets: z.array(z.string()).default([]),
  estimatedUsersAffected: z.number().int().nonnegative().optional(),
  dataBreachOccurred: z.boolean().default(false),
  dataCategories: z.array(z.string()).default([]),
  financialImpactEur: z.number().nonnegative().optional(),
  operationalImpact: z.string().optional(),

  // Timeline
  detectedAt: z.string().datetime({ offset: true }).optional(),
  containedAt: z.string().datetime({ offset: true }).optional(),
  resolvedAt: z.string().datetime({ offset: true }).optional(),

  // Response measures
  immediateActions: z.string().optional(),
  containmentMeasures: z.string().optional(),
  remediationMeasures: z.string().optional(),
  preventiveMeasures: z.string().optional(),

  // Cross-border & authority notification
  crossBorderImpact: z.boolean().default(false),
  notifiedAuthorities: z.array(z.string()).default([]),
  notifiedAt: z.string().datetime({ offset: true }).optional(),

  // Final report only
  lessonsLearned: z.string().optional(),
  recommendedActions: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Incident schemas
// ---------------------------------------------------------------------------

export const createIncidentSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  severity: z.nativeEnum(IncidentSeverity),
  nis2Classification: z
    .nativeEnum(IncidentNis2Classification)
    .default(IncidentNis2Classification.NON_SIGNIFICANT),
  spartaTechniques: z.array(spartaTechniqueEntrySchema).default([]),
  affectedAssetIds: z.array(z.string().uuid()).default([]),
  detectedAt: z.string().datetime({ offset: true }).optional(),
});

export const updateIncidentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(10000).optional(),
  severity: z.nativeEnum(IncidentSeverity).optional(),
  status: z.nativeEnum(IncidentStatus).optional(),
  nis2Classification: z.nativeEnum(IncidentNis2Classification).optional(),
  spartaTechniques: z.array(spartaTechniqueEntrySchema).optional(),
  affectedAssetIds: z.array(z.string().uuid()).optional(),
  resolvedAt: z.string().datetime({ offset: true }).optional(),
  timeToDetectMinutes: z.number().int().nonnegative().optional(),
  timeToRespondMinutes: z.number().int().nonnegative().optional(),
});

export const incidentResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  severity: z.nativeEnum(IncidentSeverity),
  status: z.nativeEnum(IncidentStatus),
  nis2Classification: z.nativeEnum(IncidentNis2Classification),
  spartaTechniques: z.array(spartaTechniqueEntrySchema),
  affectedAssetIds: z.array(z.string().uuid()),
  timeline: z.array(timelineEntrySchema),
  detectedAt: z.string().datetime().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  timeToDetectMinutes: z.number().nullable(),
  timeToRespondMinutes: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const incidentQuerySchema = z.object({
  organizationId: z.string().uuid(),
  status: z.nativeEnum(IncidentStatus).optional(),
  severity: z.nativeEnum(IncidentSeverity).optional(),
  nis2Classification: z.nativeEnum(IncidentNis2Classification).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

// ---------------------------------------------------------------------------
// Incident alert link schemas
// ---------------------------------------------------------------------------

export const addAlertToIncidentSchema = z.object({
  alertId: z.string().uuid(),
});

export const incidentAlertResponseSchema = z.object({
  id: z.string().uuid(),
  incidentId: z.string().uuid(),
  alertId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Incident note schemas
// ---------------------------------------------------------------------------

export const createIncidentNoteSchema = z.object({
  author: z.string().min(1).max(255),
  content: z.string().min(1).max(10000),
});

export const incidentNoteResponseSchema = z.object({
  id: z.string().uuid(),
  incidentId: z.string().uuid(),
  author: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Incident report schemas
// ---------------------------------------------------------------------------

export const createIncidentReportSchema = z.object({
  reportType: z.nativeEnum(IncidentReportType),
  submittedTo: z.string().max(255).optional(),
});

export const incidentReportResponseSchema = z.object({
  id: z.string().uuid(),
  incidentId: z.string().uuid(),
  reportType: z.nativeEnum(IncidentReportType),
  content: nis2ReportContentSchema,
  submittedTo: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  deadline: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type SpartaTechniqueEntry = z.infer<typeof spartaTechniqueEntrySchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type Nis2ReportContent = z.infer<typeof nis2ReportContentSchema>;

export type CreateIncident = z.infer<typeof createIncidentSchema>;
export type UpdateIncident = z.infer<typeof updateIncidentSchema>;
export type IncidentResponse = z.infer<typeof incidentResponseSchema>;
export type IncidentQuery = z.infer<typeof incidentQuerySchema>;

export type AddAlertToIncident = z.infer<typeof addAlertToIncidentSchema>;
export type IncidentAlertResponse = z.infer<typeof incidentAlertResponseSchema>;

export type CreateIncidentNote = z.infer<typeof createIncidentNoteSchema>;
export type IncidentNoteResponse = z.infer<typeof incidentNoteResponseSchema>;

export type CreateIncidentReport = z.infer<typeof createIncidentReportSchema>;
export type IncidentReportResponse = z.infer<typeof incidentReportResponseSchema>;
