-- Module 4: Incident Management
-- Creates incidents, incident_alerts, incident_notes, and incident_reports tables

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "incident_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "incident_status" AS ENUM(
    'DETECTED', 'TRIAGING', 'INVESTIGATING', 'CONTAINING',
    'ERADICATING', 'RECOVERING', 'CLOSED', 'FALSE_POSITIVE'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "incident_nis2_classification" AS ENUM('SIGNIFICANT', 'NON_SIGNIFICANT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "incident_report_type" AS ENUM(
    'EARLY_WARNING', 'INCIDENT_NOTIFICATION',
    'INTERMEDIATE_REPORT', 'FINAL_REPORT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ---------------------------------------------------------------------------
-- incidents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "incidents" (
  "id"                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"         UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title"                   VARCHAR(500) NOT NULL,
  "description"             TEXT NOT NULL,
  "severity"                "incident_severity" NOT NULL,
  "status"                  "incident_status" NOT NULL DEFAULT 'DETECTED',
  "nis2_classification"     "incident_nis2_classification" NOT NULL DEFAULT 'NON_SIGNIFICANT',
  "sparta_techniques"       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "affected_asset_ids"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "timeline"                JSONB NOT NULL DEFAULT '[]'::jsonb,
  "detected_at"             TIMESTAMPTZ,
  "resolved_at"             TIMESTAMPTZ,
  "time_to_detect_minutes"  INTEGER,
  "time_to_respond_minutes" INTEGER,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "incidents_org_id_idx"
  ON "incidents" ("organization_id");

CREATE INDEX IF NOT EXISTS "incidents_status_idx"
  ON "incidents" ("status");

CREATE INDEX IF NOT EXISTS "incidents_severity_idx"
  ON "incidents" ("severity");

CREATE INDEX IF NOT EXISTS "incidents_created_at_idx"
  ON "incidents" ("created_at");

CREATE INDEX IF NOT EXISTS "incidents_org_status_idx"
  ON "incidents" ("organization_id", "status");

-- ---------------------------------------------------------------------------
-- incident_alerts (junction table)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "incident_alerts" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "incident_id" UUID NOT NULL REFERENCES "incidents"("id") ON DELETE CASCADE,
  "alert_id"    UUID NOT NULL REFERENCES "alerts"("id") ON DELETE CASCADE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "incident_alerts_unique" UNIQUE ("incident_id", "alert_id")
);

CREATE INDEX IF NOT EXISTS "incident_alerts_incident_id_idx"
  ON "incident_alerts" ("incident_id");

CREATE INDEX IF NOT EXISTS "incident_alerts_alert_id_idx"
  ON "incident_alerts" ("alert_id");

-- ---------------------------------------------------------------------------
-- incident_notes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "incident_notes" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "incident_id" UUID NOT NULL REFERENCES "incidents"("id") ON DELETE CASCADE,
  "author"      VARCHAR(255) NOT NULL,
  "content"     TEXT NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "incident_notes_incident_id_idx"
  ON "incident_notes" ("incident_id");

-- ---------------------------------------------------------------------------
-- incident_reports
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "incident_reports" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "incident_id"  UUID NOT NULL REFERENCES "incidents"("id") ON DELETE CASCADE,
  "report_type"  "incident_report_type" NOT NULL,
  "content"      JSONB NOT NULL DEFAULT '{}'::jsonb,
  "submitted_to" VARCHAR(255),
  "submitted_at" TIMESTAMPTZ,
  "deadline"     TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "incident_reports_incident_id_idx"
  ON "incident_reports" ("incident_id");
