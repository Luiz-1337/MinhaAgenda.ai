-- Per-salon feature flag for AI retention pipeline.
-- Replaces the RETENTION_AI_SALON_ALLOWLIST env var with a database column
-- so admins can toggle salons on/off via the UI without redeploying.

ALTER TABLE "salons"
  ADD COLUMN IF NOT EXISTS "ai_retention_enabled" boolean DEFAULT false NOT NULL;
