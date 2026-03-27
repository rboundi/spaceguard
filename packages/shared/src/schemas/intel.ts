import { z } from "zod";

// ---------------------------------------------------------------------------
// Supported STIX 2.1 object types stored in SpaceGuard
// ---------------------------------------------------------------------------

export const STIX_TYPES = [
  "attack-pattern",
  "indicator",
  "threat-actor",
  "relationship",
  "malware",
  "course-of-action",
  "identity",
  "vulnerability",
] as const;

export type StixType = (typeof STIX_TYPES)[number];

// ---------------------------------------------------------------------------
// Intel response (what the API returns)
// ---------------------------------------------------------------------------

export const intelResponseSchema = z.object({
  id:          z.string().uuid(),
  stixId:      z.string(),
  stixType:    z.string(),
  name:        z.string(),
  description: z.string().nullable(),
  data:        z.record(z.unknown()),
  source:      z.string(),
  confidence:  z.number().int().min(0).max(100).nullable(),
  validFrom:   z.string().datetime().nullable(),
  validUntil:  z.string().datetime().nullable(),
  createdAt:   z.string().datetime(),
  updatedAt:   z.string().datetime(),
});

export type IntelResponse = z.infer<typeof intelResponseSchema>;

// ---------------------------------------------------------------------------
// Create intel (manual additions via API)
// ---------------------------------------------------------------------------

export const createIntelSchema = z.object({
  stixId:      z.string().min(1).max(255),
  stixType:    z.enum(STIX_TYPES),
  name:        z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  data:        z.record(z.unknown()),
  source:      z.string().min(1).max(64).default("SpaceGuard"),
  confidence:  z.number().int().min(0).max(100).optional(),
  validFrom:   z.string().datetime({ offset: true }).optional(),
  validUntil:  z.string().datetime({ offset: true }).optional(),
}).strict();

export type CreateIntel = z.infer<typeof createIntelSchema>;

// ---------------------------------------------------------------------------
// Query params for listing intel objects
// ---------------------------------------------------------------------------

export const intelQuerySchema = z.object({
  stixType: z.enum(STIX_TYPES).optional(),
  source:   z.string().max(64).optional(),
  // SPARTA tactic filter (matches data->>'x_sparta_tactic')
  tactic:   z.string().max(100).optional(),
  // Free-text search across name + description
  q:        z.string().max(200).optional(),
  page:     z.coerce.number().int().positive().default(1),
  perPage:  z.coerce.number().int().positive().max(100).default(20),
});

export type IntelQuery = z.infer<typeof intelQuerySchema>;

// ---------------------------------------------------------------------------
// Alert enrichment response
// ---------------------------------------------------------------------------

export const alertEnrichmentSchema = z.object({
  alertId:        z.string().uuid(),
  spartaTactic:   z.string().nullable(),
  spartaTechnique: z.string().nullable(),
  matchedIntel:   z.array(intelResponseSchema),
  relatedTactics: z.array(z.string()),
  mitigations:    z.array(z.string()),
  detectionTips:  z.array(z.string()),
});

export type AlertEnrichment = z.infer<typeof alertEnrichmentSchema>;
