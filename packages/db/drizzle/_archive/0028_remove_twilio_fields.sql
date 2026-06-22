-- Remove Twilio-related fields from the database
-- These columns are deprecated and no longer used

ALTER TABLE "salons" DROP COLUMN IF EXISTS "twilio_subaccount_sid";
ALTER TABLE "salons" DROP COLUMN IF EXISTS "twilio_subaccount_token";
ALTER TABLE "salons" DROP COLUMN IF EXISTS "twilio_messaging_service_sid";
ALTER TABLE "whatsapp_templates" DROP COLUMN IF EXISTS "twilio_content_sid";
ALTER TABLE "agents" DROP COLUMN IF EXISTS "twilio_sender_id";

-- Note: whatsapp_templates table and related enums may be dropped in a future migration
-- if WhatsApp functionality is completely removed
