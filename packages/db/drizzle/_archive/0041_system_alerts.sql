-- Alertas operacionais exibidos no próprio sistema.
--
-- Converte falhas hoje silenciosas (worker caído, backlog da fila, sem créditos,
-- instância desconectada, resposta não entregue) em eventos duráveis que o painel
-- pode mostrar. scope 'global' = ops; 'salon' = ligado a um salão específico.

CREATE TABLE IF NOT EXISTS "system_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" text NOT NULL,
  "salon_id" uuid,
  "type" text NOT NULL,
  "severity" text NOT NULL,
  "title" text NOT NULL,
  "detail" jsonb,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "system_alerts_scope_status_idx" ON "system_alerts" ("scope","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "system_alerts_salon_status_idx" ON "system_alerts" ("salon_id","status");
