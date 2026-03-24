-- SPARTA import history (audit trail for data imports)
CREATE TABLE IF NOT EXISTS "sparta_import_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" varchar(32) NOT NULL,
  "file_name" varchar(255),
  "version" varchar(32),
  "techniques_added" integer NOT NULL DEFAULT 0,
  "techniques_updated" integer NOT NULL DEFAULT 0,
  "techniques_unchanged" integer NOT NULL DEFAULT 0,
  "countermeasures_added" integer NOT NULL DEFAULT 0,
  "countermeasures_updated" integer NOT NULL DEFAULT 0,
  "countermeasures_unchanged" integer NOT NULL DEFAULT 0,
  "indicators_added" integer NOT NULL DEFAULT 0,
  "indicators_updated" integer NOT NULL DEFAULT 0,
  "indicators_unchanged" integer NOT NULL DEFAULT 0,
  "relationships_added" integer NOT NULL DEFAULT 0,
  "relationships_updated" integer NOT NULL DEFAULT 0,
  "relationships_unchanged" integer NOT NULL DEFAULT 0,
  "total_objects" integer NOT NULL DEFAULT 0,
  "error_details" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sparta_import_history_source_idx"
  ON "sparta_import_history" ("source");
CREATE INDEX IF NOT EXISTS "sparta_import_history_created_at_idx"
  ON "sparta_import_history" ("created_at");
