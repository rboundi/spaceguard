-- Supply Chain Management: suppliers table
-- Module: Supply Chain Risk Assessment

DO $$ BEGIN
  CREATE TYPE supplier_type AS ENUM (
    'COMPONENT_MANUFACTURER',
    'GROUND_STATION_OPERATOR',
    'LAUNCH_PROVIDER',
    'CLOUD_PROVIDER',
    'SOFTWARE_VENDOR',
    'INTEGRATION_PARTNER',
    'DATA_RELAY_PROVIDER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE supplier_criticality AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "type" "supplier_type" NOT NULL,
  "country" varchar(2) NOT NULL,
  "criticality" "supplier_criticality" NOT NULL DEFAULT 'MEDIUM',
  "description" text,
  "contact_info" jsonb,
  "assets_supplied" jsonb,
  "security_assessment" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_suppliers_organization_id" ON "suppliers" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_suppliers_type" ON "suppliers" ("type");
CREATE INDEX IF NOT EXISTS "idx_suppliers_criticality" ON "suppliers" ("criticality");
