-- Restrições de agenda POR SERVIÇO + preço sob avaliação.
--
-- Permite que cada serviço defina:
-- 1) allowed_weekdays: dias da semana permitidos (0=Domingo..6=Sábado, convenção getDay()).
--    Ex.: "Corte" só Ter/Qua/Sex/Sáb => [2,3,5,6]. NULL/[] = todos os dias (comportamento atual).
-- 2) allowed_start_times: horários de início discretos "HH:mm" (horário de Brasília).
--    Ex.: "Corte" só 09:30, 15:00, 15:30... Quando setado, os slots oferecidos/validados
--    são SOMENTE esses horários. NULL/[] = grade contínua (comportamento atual).
-- 3) duration_max: teto da faixa de duração (em minutos). A agenda reserva o MAIOR tempo
--    (duration_max ?? duration). `duration` permanece como piso/exibição. NULL = duração única.
-- 4) price_on_request: "Sob Avaliação" — a IA informa que o valor depende de avaliação e
--    mesmo assim permite agendar (não inventa preço).
--
-- Todas anuláveis / com default seguro: serviços existentes seguem inalterados.

ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "price_on_request" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "allowed_weekdays" jsonb;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "allowed_start_times" jsonb;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "duration_max" integer;
