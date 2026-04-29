-- Google Calendar Bidirectional Sync
-- Adds sync_source to appointments, initial_sync_done to salon_integrations,
-- and creates google_calendar_sync_channels table for watch channel management.

-- New enum for sync source tracking
DO $$ BEGIN
  CREATE TYPE "sync_source" AS ENUM('app', 'google');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add sync_source column to appointments
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "sync_source" "sync_source";

-- Add initial_sync_done column to salon_integrations
ALTER TABLE "salon_integrations" ADD COLUMN IF NOT EXISTS "initial_sync_done" boolean DEFAULT false NOT NULL;

-- Create google_calendar_sync_channels table
CREATE TABLE IF NOT EXISTS "google_calendar_sync_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salon_id" uuid NOT NULL REFERENCES "salons"("id") ON DELETE CASCADE,
  "calendar_id" text NOT NULL,
  "channel_id" text UNIQUE NOT NULL,
  "resource_id" text NOT NULL,
  "expiration" timestamp NOT NULL,
  "sync_token" text,
  "professional_id" uuid REFERENCES "professionals"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "gcal_sync_salon_idx" ON "google_calendar_sync_channels" ("salon_id");
CREATE INDEX IF NOT EXISTS "gcal_sync_expiration_idx" ON "google_calendar_sync_channels" ("expiration");
