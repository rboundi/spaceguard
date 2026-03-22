-- Run this script AFTER drizzle-kit push has created the telemetry_points table.
-- Converts telemetry_points into a TimescaleDB hypertable partitioned by time.
--
-- Usage (from project root):
--   psql $DATABASE_URL -f scripts/setup-hypertable.sql
-- Or paste directly into psql.

-- Convert to hypertable (idempotent - safe to re-run, will error if already a hypertable)
SELECT create_hypertable(
  'telemetry_points',
  'time',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

-- Composite index for efficient per-stream time-range queries
-- (Drizzle creates this via the schema definition, but listed here for reference)
-- CREATE INDEX IF NOT EXISTS telemetry_points_stream_time_idx
--   ON telemetry_points (stream_id, time DESC);

-- Verify the hypertable was created
SELECT
  hypertable_name,
  num_dimensions,
  num_chunks
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'telemetry_points';
