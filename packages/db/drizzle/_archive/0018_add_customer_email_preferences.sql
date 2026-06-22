-- Add email and preferences columns to customers table
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "preferences" jsonb;

