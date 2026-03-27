import { z } from "zod";

// ---------------------------------------------------------------------------
// STIX 2.1 Bundle validation for SPARTA imports
// ---------------------------------------------------------------------------

// Individual STIX object - loosely validated so we accept any valid STIX type
export const stixObjectSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  created: z.string().optional(),
  modified: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
}).passthrough().strict();

export type StixObject = z.infer<typeof stixObjectSchema>;

// Full STIX 2.1 bundle (the shape of the uploaded JSON file)
export const stixBundleSchema = z.object({
  type: z.literal("bundle"),
  id: z.string().min(1),
  objects: z.array(stixObjectSchema).min(1),
}).strict();

export type StixBundle = z.infer<typeof stixBundleSchema>;

// ---------------------------------------------------------------------------
// SPARTA import diff - returned after a successful import
// ---------------------------------------------------------------------------

export const spartaImportDiffSchema = z.object({
  techniques: z.object({
    added: z.number().int(),
    updated: z.number().int(),
    unchanged: z.number().int(),
    total: z.number().int(),
  }),
  countermeasures: z.object({
    added: z.number().int(),
    updated: z.number().int(),
    unchanged: z.number().int(),
    total: z.number().int(),
  }),
  indicators: z.object({
    added: z.number().int(),
    updated: z.number().int(),
    unchanged: z.number().int(),
    total: z.number().int(),
  }),
  relationships: z.object({
    added: z.number().int(),
    updated: z.number().int(),
    unchanged: z.number().int(),
    total: z.number().int(),
  }),
  version: z.string().nullable(),
  importedAt: z.string().datetime(),
});

export type SpartaImportDiff = z.infer<typeof spartaImportDiffSchema>;

// ---------------------------------------------------------------------------
// SPARTA status response - current state of SPARTA data in the system
// ---------------------------------------------------------------------------

export const spartaStatusSchema = z.object({
  version: z.string().nullable(),
  lastImportedAt: z.string().datetime().nullable(),
  lastImportSource: z.string().nullable(),
  counts: z.object({
    attackPatterns: z.number().int(),
    courseOfActions: z.number().int(),
    indicators: z.number().int(),
    relationships: z.number().int(),
    total: z.number().int(),
  }),
  recentImports: z.array(z.object({
    id: z.string().uuid(),
    source: z.string(),
    version: z.string().nullable(),
    techniquesAdded: z.number().int(),
    techniquesUpdated: z.number().int(),
    countermeasuresAdded: z.number().int(),
    countermeasuresUpdated: z.number().int(),
    importedAt: z.string().datetime(),
  })),
});

export type SpartaStatus = z.infer<typeof spartaStatusSchema>;

// ---------------------------------------------------------------------------
// Import source enum
// ---------------------------------------------------------------------------

export const SPARTA_IMPORT_SOURCES = ["FILE_UPLOAD", "SERVER_FETCH"] as const;
export type SpartaImportSource = (typeof SPARTA_IMPORT_SOURCES)[number];

// ---------------------------------------------------------------------------
// Server fetch request (optional override URL)
// ---------------------------------------------------------------------------

export const spartaFetchRequestSchema = z.object({
  url: z
    .string()
    .url()
    .default("https://sparta.aerospace.org/download/STIX?f=latest"),
}).strict();

export type SpartaFetchRequest = z.infer<typeof spartaFetchRequestSchema>;
