-- Audit Trail: audit_log table
-- Provides NIS2 Article 21(2)(i) compliance evidence

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE',
    'VIEW',
    'EXPORT',
    'LOGIN',
    'LOGOUT',
    'STATUS_CHANGE',
    'REPORT_GENERATED',
    'ALERT_ACKNOWLEDGED',
    'INCIDENT_CREATED',
    'MAPPING_CHANGED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  "actor"           varchar(255) NOT NULL DEFAULT 'system',
  "action"          "audit_action" NOT NULL,
  "resource_type"   varchar(100),
  "resource_id"     uuid,
  "details"         jsonb,
  "ip_address"      varchar(45),
  "timestamp"       timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_audit_log_org_ts"
  ON "audit_log" ("organization_id", "timestamp" DESC);

CREATE INDEX IF NOT EXISTS "idx_audit_log_actor"
  ON "audit_log" ("actor");

CREATE INDEX IF NOT EXISTS "idx_audit_log_resource"
  ON "audit_log" ("resource_type", "resource_id");
