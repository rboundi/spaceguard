-- Playbook execution status enum
DO $$ BEGIN
  CREATE TYPE playbook_execution_status AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Playbooks table
CREATE TABLE IF NOT EXISTS "playbooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "trigger" jsonb NOT NULL,
  "steps" jsonb NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "execution_count" integer NOT NULL DEFAULT 0,
  "last_executed" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "playbooks_org_id_idx" ON "playbooks" ("organization_id");
CREATE INDEX IF NOT EXISTS "playbooks_active_idx" ON "playbooks" ("is_active");

-- Playbook Executions table
CREATE TABLE IF NOT EXISTS "playbook_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "playbook_id" uuid NOT NULL REFERENCES "playbooks"("id") ON DELETE CASCADE,
  "incident_id" uuid REFERENCES "incidents"("id") ON DELETE SET NULL,
  "alert_id" uuid REFERENCES "alerts"("id") ON DELETE SET NULL,
  "triggered_by" varchar(255) NOT NULL,
  "status" playbook_execution_status NOT NULL DEFAULT 'RUNNING',
  "steps_completed" integer NOT NULL DEFAULT 0,
  "steps_total" integer NOT NULL,
  "log" jsonb NOT NULL DEFAULT '[]',
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pb_exec_playbook_id_idx" ON "playbook_executions" ("playbook_id");
CREATE INDEX IF NOT EXISTS "pb_exec_status_idx" ON "playbook_executions" ("status");
CREATE INDEX IF NOT EXISTS "pb_exec_alert_id_idx" ON "playbook_executions" ("alert_id");
CREATE INDEX IF NOT EXISTS "pb_exec_incident_id_idx" ON "playbook_executions" ("incident_id");
