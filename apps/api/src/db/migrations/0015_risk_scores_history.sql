CREATE TABLE IF NOT EXISTS "risk_scores_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "asset_id" uuid REFERENCES "space_assets"("id") ON DELETE CASCADE,
  "score" integer NOT NULL,
  "breakdown" jsonb NOT NULL,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "risk_scores_org_id_idx" ON "risk_scores_history" ("organization_id");
CREATE INDEX IF NOT EXISTS "risk_scores_asset_id_idx" ON "risk_scores_history" ("asset_id");
CREATE INDEX IF NOT EXISTS "risk_scores_calc_at_idx" ON "risk_scores_history" ("calculated_at");
CREATE INDEX IF NOT EXISTS "risk_scores_org_calc_idx" ON "risk_scores_history" ("organization_id", "calculated_at");
