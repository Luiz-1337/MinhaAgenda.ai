-- Retention AI MVP
-- Adds opt-out fields to customers, average cycle to services, AI flags to recovery_steps,
-- AI/audit fields to campaign_messages, and creates retention_response_audit table.

-- ============================================================================
-- customers: opt-out tracking (LGPD)
-- ============================================================================
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "opted_out_at" timestamp;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "opt_out_reason" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "opt_out_source" text;

-- Partial index for active customers (opt-out check is hot path in dispatcher)
CREATE INDEX IF NOT EXISTS "customers_active_phone_idx"
  ON "customers" ("salon_id", "phone")
  WHERE "opted_out_at" IS NULL;

-- ============================================================================
-- services: average cycle days for inactivity calculation
-- ============================================================================
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "average_cycle_days" integer;

-- ============================================================================
-- recovery_steps: AI generation flags
-- ============================================================================
ALTER TABLE "recovery_steps" ADD COLUMN IF NOT EXISTS "use_ai_generation" boolean DEFAULT false NOT NULL;
ALTER TABLE "recovery_steps" ADD COLUMN IF NOT EXISTS "include_ai_coupon" boolean DEFAULT false NOT NULL;
ALTER TABLE "recovery_steps" ADD COLUMN IF NOT EXISTS "ai_tone_override" text;

-- ============================================================================
-- campaign_messages: AI metadata + idempotency
-- ============================================================================
ALTER TABLE "campaign_messages" ADD COLUMN IF NOT EXISTS "recovery_step_id" uuid;
ALTER TABLE "campaign_messages" ADD COLUMN IF NOT EXISTS "message_hash" text;
ALTER TABLE "campaign_messages" ADD COLUMN IF NOT EXISTS "generated_by_ai" boolean DEFAULT false NOT NULL;
ALTER TABLE "campaign_messages" ADD COLUMN IF NOT EXISTS "tokens_used" integer;
ALTER TABLE "campaign_messages" ADD COLUMN IF NOT EXISTS "model_used" text;

DO $$ BEGIN
  ALTER TABLE "campaign_messages"
    ADD CONSTRAINT "campaign_messages_recovery_step_id_fk"
    FOREIGN KEY ("recovery_step_id") REFERENCES "recovery_steps"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "campaign_messages_recovery_step_idx"
  ON "campaign_messages" ("recovery_step_id");

-- Strong idempotency: one execution of the step per customer per day
-- Robust against template edits (does not include message text in the key)
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_msgs_dedup"
  ON "campaign_messages" ("customer_id", "recovery_step_id", (("sent_at")::date))
  WHERE "customer_id" IS NOT NULL AND "recovery_step_id" IS NOT NULL;

-- Partial index for the hot path opt-out check (hasRecentAiMessage)
CREATE INDEX IF NOT EXISTS "campaign_msgs_recent_ai_idx"
  ON "campaign_messages" ("customer_id", "sent_at" DESC)
  WHERE "generated_by_ai" = true AND "status" = 'sent';

-- ============================================================================
-- retention_response_audit: Camada 2 (soft signal flagging) + Camada 3 (LLM classification)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "retention_response_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salon_id" uuid NOT NULL REFERENCES "salons"("id") ON DELETE CASCADE,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE CASCADE,
  "phone" text NOT NULL,
  "retention_campaign_message_id" uuid REFERENCES "campaign_messages"("id") ON DELETE SET NULL,
  "response_body" text NOT NULL,
  "soft_signal_match" boolean DEFAULT true NOT NULL,
  "sentiment_label" text,
  "sentiment_confidence" numeric(3, 2),
  "reviewed_at" timestamp,
  "action_taken" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "retention_audit_salon_idx" ON "retention_response_audit" ("salon_id");
CREATE INDEX IF NOT EXISTS "retention_audit_customer_idx" ON "retention_response_audit" ("customer_id");
CREATE INDEX IF NOT EXISTS "retention_audit_unreviewed_idx" ON "retention_response_audit" ("reviewed_at");
CREATE INDEX IF NOT EXISTS "retention_audit_created_idx" ON "retention_response_audit" ("created_at");
