-- Customer Trinks Profile cache.
-- Stores enriched customer data fetched from Trinks API (gasto total, ticket médio,
-- frequência, etiquetas, etc) so the AI agent can leverage Cliente 360° insights
-- without paying API latency on every conversation.
--
-- Fed by:
--   - Daily cron sync (/api/cron/trinks-sync) — full refresh per salon
--   - On-demand background sync (worker) when profile is null/stale during conversation

CREATE TABLE IF NOT EXISTS "customer_trinks_profile" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "salon_id" uuid NOT NULL REFERENCES "salons"("id") ON DELETE CASCADE,
  "trinks_client_id" text,
  "total_spent" numeric(10, 2) DEFAULT '0' NOT NULL,
  "average_ticket" numeric(10, 2) DEFAULT '0' NOT NULL,
  "visit_count_90_days" integer DEFAULT 0 NOT NULL,
  "visit_count_365_days" integer DEFAULT 0 NOT NULL,
  "last_visit_at" timestamp,
  "first_visit_at" timestamp,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "recent_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "vip_score" smallint DEFAULT 0 NOT NULL,
  "trinks_not_found" boolean DEFAULT false NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- One profile per customer (not per salon — customer is already scoped by salon)
CREATE UNIQUE INDEX IF NOT EXISTS "customer_trinks_profile_customer_idx"
  ON "customer_trinks_profile" ("customer_id");

-- Hot path: cron picks salon's profiles ordered by syncedAt to refresh oldest first
CREATE INDEX IF NOT EXISTS "customer_trinks_profile_salon_synced_idx"
  ON "customer_trinks_profile" ("salon_id", "synced_at");

-- Hot path: retention dispatcher prioritizes VIPs (vip_score > 0) for inactive sweep
CREATE INDEX IF NOT EXISTS "customer_trinks_profile_vip_idx"
  ON "customer_trinks_profile" ("salon_id", "vip_score" DESC)
  WHERE "vip_score" > 0;
