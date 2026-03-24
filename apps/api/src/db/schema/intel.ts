import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// threat_intel
// ---------------------------------------------------------------------------
// Stores STIX 2.1 objects enriching the detection and incident workflows.
// Primarily seeded with SPARTA space-attack techniques, but also accepts
// ENISA Space Threat Landscape entries, custom indicators, and relationships.
//
// stix_id is the canonical STIX 2.1 identifier (globally unique), making
// upserts idempotent even if the seeder is run multiple times.

export const threatIntel = pgTable(
  "threat_intel",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // STIX 2.1 canonical identifier, e.g. "attack-pattern--<uuid>"
    stixId: varchar("stix_id", { length: 255 }).notNull().unique(),

    // STIX object type: attack-pattern, indicator, threat-actor,
    // relationship, malware, course-of-action, etc.
    stixType: varchar("stix_type", { length: 64 }).notNull(),

    // Human-readable name (copied from STIX for fast indexed queries)
    name: varchar("name", { length: 255 }).notNull(),

    // Short human-readable description
    description: text("description"),

    // Full STIX 2.1 object stored verbatim for downstream tooling
    data: jsonb("data").notNull(),

    // Origin of the record: "SPARTA", "ENISA", "SpaceGuard", custom
    source: varchar("source", { length: 64 }).notNull().default("SpaceGuard"),

    // Analyst confidence in this record (0-100)
    confidence: integer("confidence"),

    // Validity window (from STIX valid_from / valid_until fields)
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    stixTypeIdx: index("threat_intel_stix_type_idx").on(table.stixType),
    sourceIdx:   index("threat_intel_source_idx").on(table.source),
    nameIdx:     index("threat_intel_name_idx").on(table.name),
  })
);

// Inferred types
export type ThreatIntel    = typeof threatIntel.$inferSelect;
export type NewThreatIntel = typeof threatIntel.$inferInsert;
