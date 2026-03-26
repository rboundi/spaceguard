-- Migration: Add anomaly detection baselines table and learning_mode_until column
-- Part of: feat: statistical anomaly detection with rolling baselines

-- 1. Add learning_mode_until to telemetry_streams
ALTER TABLE "telemetry_streams"
  ADD COLUMN "learning_mode_until" timestamp with time zone;

-- 2. Set learning_mode_until for existing streams to NOW (they skip learning mode)
UPDATE "telemetry_streams"
  SET "learning_mode_until" = NOW()
  WHERE "learning_mode_until" IS NULL;

-- 3. Create telemetry_baselines table
CREATE TABLE IF NOT EXISTS "telemetry_baselines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stream_id" uuid NOT NULL REFERENCES "telemetry_streams"("id") ON DELETE CASCADE,
  "parameter_name" varchar(255) NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "mean" double precision NOT NULL,
  "std_deviation" double precision NOT NULL,
  "min_value" double precision NOT NULL,
  "max_value" double precision NOT NULL,
  "sample_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. Unique constraint: one baseline per (stream, parameter)
ALTER TABLE "telemetry_baselines"
  ADD CONSTRAINT "telemetry_baselines_stream_param_uniq"
  UNIQUE ("stream_id", "parameter_name");

-- 5. Index for fast lookup by stream
CREATE INDEX IF NOT EXISTS "telemetry_baselines_stream_idx"
  ON "telemetry_baselines" ("stream_id");
