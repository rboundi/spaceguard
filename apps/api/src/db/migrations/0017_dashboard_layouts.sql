-- Dashboard Layouts: per-user customizable dashboard widget arrangements
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layout        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each user has at most one layout (upsert pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_layouts_user_id
  ON dashboard_layouts (user_id);
