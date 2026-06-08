-- Flag de "placeholder de sistema" para itens criados automaticamente por
-- integrações (ex.: a sync do Google Calendar cria o serviço "Bloqueio de
-- Horário" e o contato "Google Calendar" para representar horários ocupados).
--
-- Itens com is_system=true são INTERNOS: nunca aparecem nos catálogos/listas
-- voltados ao cliente (bot/IA), nem na tela de serviços/CRM do dono, e não são
-- agendáveis. Default false => todos os itens existentes seguem normais.

ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill dos placeholders já criados pela sync do Google Calendar.
-- O serviço também vira inativo (defesa extra: os catálogos já filtram is_active).
UPDATE "services" SET "is_system" = true, "is_active" = false WHERE "name" = 'Bloqueio de Horário';
--> statement-breakpoint
UPDATE "customers" SET "is_system" = true WHERE "phone" = '0000000000' AND "name" = 'Google Calendar';
