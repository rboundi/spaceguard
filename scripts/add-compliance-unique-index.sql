-- Migration: add partial unique index on compliance_mappings
--
-- Prevents duplicate org-level mappings (asset_id IS NULL) that could be
-- created by concurrent dashboard requests hitting the auto-seeding logic.
--
-- Run once against the database:
--   psql $DATABASE_URL -f scripts/add-compliance-unique-index.sql
--
-- Safe to re-run (IF NOT EXISTS).

CREATE UNIQUE INDEX IF NOT EXISTS compliance_mappings_org_req_org_level_uniq
  ON compliance_mappings (organization_id, requirement_id)
  WHERE asset_id IS NULL;
