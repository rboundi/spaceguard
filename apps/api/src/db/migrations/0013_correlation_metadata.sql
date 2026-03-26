-- Add correlation metadata columns to incidents table
-- Used by the alert correlation engine to tag auto-correlated incidents.

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS correlation_rule VARCHAR(100),
  ADD COLUMN IF NOT EXISTS correlation_score DOUBLE PRECISION;

-- Index for quick lookup of correlated incidents by rule
CREATE INDEX IF NOT EXISTS incidents_correlation_rule_idx
  ON incidents (correlation_rule)
  WHERE correlation_rule IS NOT NULL;
