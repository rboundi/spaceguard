-- Migration 0010: Add notification preferences to users table
-- Run via: node -e "const pg = require('postgres'); const sql = pg('postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard'); sql.file('apps/api/src/db/migrations/0010_user_notification_prefs.sql').then(() => { console.log('Done'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });"

ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_critical_alerts BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_deadlines BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_weekly_digest BOOLEAN NOT NULL DEFAULT true;
