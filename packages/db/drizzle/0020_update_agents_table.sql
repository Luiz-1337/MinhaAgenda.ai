-- Remove unique constraint from salon_id to allow multiple agents per salon
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_salon_id_unique";
--> statement-breakpoint
-- Add new columns: model, tone, whatsapp_number
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "tone" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "whatsapp_number" text;
--> statement-breakpoint
-- Set default values for existing records
UPDATE "agents" SET "model" = 'gpt-5-mini' WHERE "model" IS NULL;
UPDATE "agents" SET "tone" = 'informal' WHERE "tone" IS NULL;
--> statement-breakpoint
-- Make model and tone NOT NULL after setting defaults
ALTER TABLE "agents" ALTER COLUMN "model" SET NOT NULL;
ALTER TABLE "agents" ALTER COLUMN "tone" SET NOT NULL;
--> statement-breakpoint
-- Change default of is_active to false (only one active at a time)
ALTER TABLE "agents" ALTER COLUMN "is_active" SET DEFAULT false;

