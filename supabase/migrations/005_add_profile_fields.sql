-- Add missing columns to profiles table
ALTER TABLE "public"."profiles" 
  ADD COLUMN IF NOT EXISTS "first_name" text,
  ADD COLUMN IF NOT EXISTS "last_name" text,
  ADD COLUMN IF NOT EXISTS "billing_address" text,
  ADD COLUMN IF NOT EXISTS "billing_postal_code" text,
  ADD COLUMN IF NOT EXISTS "billing_city" text,
  ADD COLUMN IF NOT EXISTS "billing_state" text,
  ADD COLUMN IF NOT EXISTS "billing_country" text DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS "billing_address_complement" text,
  ADD COLUMN IF NOT EXISTS "document_type" text,
  ADD COLUMN IF NOT EXISTS "document_number" text,
  ADD COLUMN IF NOT EXISTS "google_access_token" text,
  ADD COLUMN IF NOT EXISTS "google_refresh_token" text,
  ADD COLUMN IF NOT EXISTS "calendar_sync_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false NOT NULL;

-- Add role column if it doesn't exist (check if it's an enum type)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'role'
  ) THEN
    ALTER TABLE "public"."profiles" ADD COLUMN "role" "public"."profile_role" DEFAULT 'CLIENT' NOT NULL;
  END IF;
END $$;

-- Add tier column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'tier'
  ) THEN
    ALTER TABLE "public"."profiles" ADD COLUMN "tier" "public"."subscription_tier" DEFAULT 'SOLO' NOT NULL;
  END IF;
END $$;

-- Add salon_id column if it doesn't exist (FK will be added in 004_add_salon_id_fk.sql)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'salon_id'
  ) THEN
    ALTER TABLE "public"."profiles" ADD COLUMN "salon_id" uuid;
  END IF;
END $$;

