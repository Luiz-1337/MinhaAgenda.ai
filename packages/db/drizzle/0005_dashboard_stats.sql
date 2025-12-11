-- Create ai_usage_stats table for tracking AI usage and credits
CREATE TABLE IF NOT EXISTS "ai_usage_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salon_id" uuid NOT NULL,
  "date" date NOT NULL,
  "model" text NOT NULL,
  "credits" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_stats_salon_id_salons_id_fk'
  ) THEN
    ALTER TABLE "ai_usage_stats"
      ADD CONSTRAINT "ai_usage_stats_salon_id_salons_id_fk"
      FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ai_usage_salon_date_idx" ON "ai_usage_stats" USING btree ("salon_id", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_salon_date_model_unique" ON "ai_usage_stats" USING btree ("salon_id", "date", "model");

-- Create agent_stats table for tracking agent performance
CREATE TABLE IF NOT EXISTS "agent_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salon_id" uuid NOT NULL,
  "agent_name" text NOT NULL,
  "total_credits" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_stats_salon_id_salons_id_fk'
  ) THEN
    ALTER TABLE "agent_stats"
      ADD CONSTRAINT "agent_stats_salon_id_salons_id_fk"
      FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "agent_stats_salon_agent_idx" ON "agent_stats" USING btree ("salon_id", "agent_name");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_stats_salon_agent_unique" ON "agent_stats" USING btree ("salon_id", "agent_name");

