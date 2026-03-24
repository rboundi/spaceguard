-- Migration: Module 3 - Detection Engine alert schema
-- Run against your PostgreSQL database with:
--   docker compose exec -T postgres psql -U spaceguard -d spaceguard < scripts/add-alerts-table.sql
-- or:
--   psql $DATABASE_URL -f scripts/add-alerts-table.sql

-- Enums (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
    CREATE TYPE alert_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_status') THEN
    CREATE TYPE alert_status AS ENUM ('NEW', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE');
  END IF;
END$$;

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stream_id           UUID                 REFERENCES telemetry_streams(id) ON DELETE SET NULL,
  rule_id             VARCHAR(64) NOT NULL,
  severity            alert_severity NOT NULL,
  title               VARCHAR(255) NOT NULL,
  description         TEXT        NOT NULL,
  status              alert_status NOT NULL DEFAULT 'NEW',
  sparta_tactic       VARCHAR(100),
  sparta_technique    VARCHAR(100),
  affected_asset_id   UUID                 REFERENCES space_assets(id) ON DELETE SET NULL,
  triggered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  resolved_by         VARCHAR(255),
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS alerts_org_id_idx       ON alerts (organization_id);
CREATE INDEX IF NOT EXISTS alerts_status_idx        ON alerts (status);
CREATE INDEX IF NOT EXISTS alerts_severity_idx      ON alerts (severity);
CREATE INDEX IF NOT EXISTS alerts_triggered_at_idx  ON alerts (triggered_at);
CREATE INDEX IF NOT EXISTS alerts_stream_id_idx     ON alerts (stream_id);
CREATE INDEX IF NOT EXISTS alerts_org_triggered_idx ON alerts (organization_id, triggered_at);
