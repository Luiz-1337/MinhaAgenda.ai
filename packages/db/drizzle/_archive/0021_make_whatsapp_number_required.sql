-- Make whatsapp_number NOT NULL in agents table
-- First, check if there are any agents without whatsapp_number
-- If there are, this migration will fail and you need to update them first
--> statement-breakpoint
-- Make whatsapp_number NOT NULL
ALTER TABLE "agents" ALTER COLUMN "whatsapp_number" SET NOT NULL;

