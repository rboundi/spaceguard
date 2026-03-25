-- Add new audit action enum values for settings operations
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'TEST_NOTIFICATION';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'KEY_REGENERATION';
