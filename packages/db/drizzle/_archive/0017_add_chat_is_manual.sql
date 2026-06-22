-- Add is_manual column to chats table
ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "is_manual" boolean DEFAULT false NOT NULL;

