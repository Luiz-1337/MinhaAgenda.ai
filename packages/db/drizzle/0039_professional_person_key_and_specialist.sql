-- Multi-salão + especialistas por serviço.
--
-- 1) professionals.person_key: identidade de pessoa compartilhada entre salões
--    (mesma pessoa física = mesmo person_key, inclusive entre contas). Usado para
--    unir livre/ocupado e travar o booking por pessoa, evitando double-booking de
--    um profissional que atende em mais de um salão. Backfill: cada linha recebe um
--    person_key próprio (= comportamento atual; nenhuma união até linkar de fato).
--    Mantido NULLABLE nesta fase (endurecer para NOT NULL na fase cross-account).
--
-- 2) professional_services.is_specialist: a presença da linha continua significando
--    "executa o serviço" (capability); a flag marca o especialista preferido.

ALTER TABLE "professionals" ADD COLUMN IF NOT EXISTS "person_key" uuid;
--> statement-breakpoint
UPDATE "professionals" SET "person_key" = gen_random_uuid() WHERE "person_key" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "professionals_person_key_idx" ON "professionals" ("person_key");
--> statement-breakpoint
ALTER TABLE "professional_services" ADD COLUMN IF NOT EXISTS "is_specialist" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pro_service_specialist_idx" ON "professional_services" ("service_id", "is_specialist");
