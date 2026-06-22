-- Add whatsapp_numbers column (jsonb, default '[]')
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "whatsapp_numbers" jsonb DEFAULT '[]' NOT NULL;

-- Make whatsapp_number nullable (allows creating agent and connecting WhatsApp later)
ALTER TABLE "agents" ALTER COLUMN "whatsapp_number" DROP NOT NULL;
