-- Add Twilio subaccount and Meta WABA fields to salons table
ALTER TABLE "salons" ADD COLUMN IF NOT EXISTS "twilio_subaccount_sid" text;
ALTER TABLE "salons" ADD COLUMN IF NOT EXISTS "twilio_subaccount_token" text;
ALTER TABLE "salons" ADD COLUMN IF NOT EXISTS "twilio_messaging_service_sid" text;
ALTER TABLE "salons" ADD COLUMN IF NOT EXISTS "meta_waba_id" text;
ALTER TABLE "salons" ADD COLUMN IF NOT EXISTS "meta_phone_number_id" text;

-- Create enum for WhatsApp template status
DO $$ BEGIN
  CREATE TYPE "whatsapp_template_status" AS ENUM ('draft', 'pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create enum for WhatsApp template category
DO $$ BEGIN
  CREATE TYPE "whatsapp_template_category" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create WhatsApp HSM templates table
CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salon_id" uuid NOT NULL REFERENCES "salons"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "language" text DEFAULT 'pt_BR' NOT NULL,
  "category" "whatsapp_template_category" NOT NULL,
  "body" text NOT NULL,
  "header" text,
  "footer" text,
  "buttons" jsonb,
  "twilio_content_sid" text,
  "status" "whatsapp_template_status" DEFAULT 'draft' NOT NULL,
  "rejection_reason" text,
  "submitted_at" timestamp,
  "approved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for whatsapp_templates
CREATE INDEX IF NOT EXISTS "whatsapp_templates_salon_idx" ON "whatsapp_templates" ("salon_id");
CREATE INDEX IF NOT EXISTS "whatsapp_templates_status_idx" ON "whatsapp_templates" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_templates_salon_name_unique" ON "whatsapp_templates" ("salon_id", "name");
