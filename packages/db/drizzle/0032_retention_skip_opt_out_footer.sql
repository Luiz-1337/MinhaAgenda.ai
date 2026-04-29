-- Retention AI: per-step flag to skip the "responder PARAR" footer
-- in AI-generated retention messages. WARNING: opt-out footer is a
-- compliance/anti-ban mitigation. Disabling is a salon-level decision.

ALTER TABLE "recovery_steps"
  ADD COLUMN IF NOT EXISTS "ai_skip_opt_out_footer" boolean DEFAULT false NOT NULL;
