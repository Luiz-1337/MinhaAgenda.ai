-- Add salons.settings JSONB for AI context
ALTER TABLE "salons" ADD COLUMN IF NOT EXISTS "settings" jsonb;

-- Add appointments.end_time for fast conflict checks
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "end_time" timestamp;
-- Backfill end_time based on service duration (minutes)
UPDATE "appointments" a
SET "end_time" = a."date" + (s."duration" || ' minutes')::interval
FROM "services" s
WHERE s."id" = a."service_id" AND a."end_time" IS NULL;
-- Enforce NOT NULL after backfill
ALTER TABLE "appointments" ALTER COLUMN "end_time" SET NOT NULL;
-- Index to accelerate overlap queries per professional
CREATE INDEX IF NOT EXISTS "appt_prof_time_idx" ON "appointments" USING btree ("professional_id","date","end_time");

-- Create schedule_overrides for absences/time off
CREATE TABLE IF NOT EXISTS "schedule_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salon_id" uuid,
  "professional_id" uuid NOT NULL,
  "start_time" timestamp NOT NULL,
  "end_time" timestamp NOT NULL,
  "reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "schedule_overrides"
  ADD CONSTRAINT IF NOT EXISTS "schedule_overrides_salon_id_salons_id_fk"
  FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade;
ALTER TABLE "schedule_overrides"
  ADD CONSTRAINT IF NOT EXISTS "schedule_overrides_professional_id_professionals_id_fk"
  FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade;
CREATE INDEX IF NOT EXISTS "override_prof_time_idx" ON "schedule_overrides" USING btree ("professional_id","start_time","end_time");

-- Create professional_services junction
CREATE TABLE IF NOT EXISTS "professional_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "professional_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "professional_services"
  ADD CONSTRAINT IF NOT EXISTS "professional_services_professional_id_professionals_id_fk"
  FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade;
ALTER TABLE "professional_services"
  ADD CONSTRAINT IF NOT EXISTS "professional_services_service_id_services_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade;
CREATE UNIQUE INDEX IF NOT EXISTS "pro_service_unique" ON "professional_services" USING btree ("professional_id","service_id");

-- Remove password_hash (managed by Supabase Auth)
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "password_hash";
