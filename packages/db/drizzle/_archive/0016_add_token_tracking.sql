-- Add token tracking fields to messages table
ALTER TABLE "messages" 
  ADD COLUMN IF NOT EXISTS "input_tokens" integer,
  ADD COLUMN IF NOT EXISTS "output_tokens" integer,
  ADD COLUMN IF NOT EXISTS "model" text,
  ADD COLUMN IF NOT EXISTS "total_tokens" integer;

-- Add timestamp fields to chats table for response time calculation
ALTER TABLE "chats"
  ADD COLUMN IF NOT EXISTS "first_user_message_at" timestamp,
  ADD COLUMN IF NOT EXISTS "first_agent_response_at" timestamp;

-- Create index on messages.model for faster queries
CREATE INDEX IF NOT EXISTS "messages_model_idx" ON "messages" USING btree ("model");

-- Create index on chats timestamps for faster queries
CREATE INDEX IF NOT EXISTS "chats_timestamps_idx" ON "chats" USING btree ("first_user_message_at", "first_agent_response_at");





