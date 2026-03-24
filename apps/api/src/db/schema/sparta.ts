import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// sparta_import_history
// ---------------------------------------------------------------------------
// Audit trail for every SPARTA data import, whether via file upload or
// server-side fetch from sparta.aerospace.org.

export const spartaImportHistory = pgTable(
  "sparta_import_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // "FILE_UPLOAD" or "SERVER_FETCH"
    source: varchar("source", { length: 32 }).notNull(),

    // Original file name when uploaded, null for server fetches
    fileName: varchar("file_name", { length: 255 }),

    // SPARTA version string from x-sparta-collection, e.g. "v3.2"
    version: varchar("version", { length: 32 }),

    // Diff counts for techniques (attack-pattern)
    techniquesAdded: integer("techniques_added").notNull().default(0),
    techniquesUpdated: integer("techniques_updated").notNull().default(0),
    techniquesUnchanged: integer("techniques_unchanged").notNull().default(0),

    // Diff counts for countermeasures (course-of-action)
    countermeasuresAdded: integer("countermeasures_added").notNull().default(0),
    countermeasuresUpdated: integer("countermeasures_updated").notNull().default(0),
    countermeasuresUnchanged: integer("countermeasures_unchanged").notNull().default(0),

    // Diff counts for indicators
    indicatorsAdded: integer("indicators_added").notNull().default(0),
    indicatorsUpdated: integer("indicators_updated").notNull().default(0),
    indicatorsUnchanged: integer("indicators_unchanged").notNull().default(0),

    // Diff counts for relationships
    relationshipsAdded: integer("relationships_added").notNull().default(0),
    relationshipsUpdated: integer("relationships_updated").notNull().default(0),
    relationshipsUnchanged: integer("relationships_unchanged").notNull().default(0),

    // Total STIX objects in the bundle
    totalObjects: integer("total_objects").notNull().default(0),

    // Optional error message if import partially failed
    errorDetails: text("error_details"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceIdx: index("sparta_import_history_source_idx").on(table.source),
    createdAtIdx: index("sparta_import_history_created_at_idx").on(
      table.createdAt
    ),
  })
);

export type SpartaImportHistoryRow = typeof spartaImportHistory.$inferSelect;
export type NewSpartaImportHistory = typeof spartaImportHistory.$inferInsert;
