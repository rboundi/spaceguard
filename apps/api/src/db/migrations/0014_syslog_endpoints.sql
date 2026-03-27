-- Syslog endpoint configuration for SIEM integration (CEF/LEEF/JSON)

DO $$ BEGIN
  CREATE TYPE syslog_protocol AS ENUM ('UDP', 'TCP', 'TLS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE syslog_format AS ENUM ('CEF', 'LEEF', 'JSON');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE syslog_min_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS syslog_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 514,
  protocol syslog_protocol NOT NULL DEFAULT 'UDP',
  format syslog_format NOT NULL DEFAULT 'CEF',
  min_severity syslog_min_severity NOT NULL DEFAULT 'LOW',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS syslog_endpoints_org_id_idx
  ON syslog_endpoints (organization_id);
CREATE INDEX IF NOT EXISTS syslog_endpoints_active_idx
  ON syslog_endpoints (organization_id, is_active);
