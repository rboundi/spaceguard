-- Module 5: Threat Intelligence Store
-- Creates the threat_intel table for STIX 2.1 objects (SPARTA, ENISA, custom)

-- ---------------------------------------------------------------------------
-- threat_intel
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "threat_intel" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stix_id"     varchar(255) NOT NULL UNIQUE,
  "stix_type"   varchar(64)  NOT NULL,
  "name"        varchar(255) NOT NULL,
  "description" text,
  "data"        jsonb        NOT NULL,
  "source"      varchar(64)  NOT NULL DEFAULT 'SpaceGuard',
  "confidence"  integer,
  "valid_from"  timestamptz,
  "valid_until" timestamptz,
  "created_at"  timestamptz  NOT NULL DEFAULT now(),
  "updated_at"  timestamptz  NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS "threat_intel_stix_type_idx" ON "threat_intel" ("stix_type");
CREATE INDEX IF NOT EXISTS "threat_intel_source_idx"    ON "threat_intel" ("source");
CREATE INDEX IF NOT EXISTS "threat_intel_name_idx"      ON "threat_intel" ("name");

-- GIN index on the STIX data jsonb for jsonb_path_query / @> operator searches
CREATE INDEX IF NOT EXISTS "threat_intel_data_gin_idx"  ON "threat_intel" USING gin ("data");
