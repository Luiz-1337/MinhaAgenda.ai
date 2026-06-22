-- Rastreamento de entrega de mensagens (saída).
--
-- Hoje uma resposta enviada pela IA recebe HTTP 200 da Evolution (= "aceita na
-- fila"), mas a entrega real pode falhar depois (evento messages.update com
-- status:0 = ERROR). Sem colunas de status, essa falha é invisível.
--
-- 1) provider_message_id: o key.id que a Evolution devolve ao enviar. É a chave
--    de correlação que liga o evento messages.update de volta a esta linha.
-- 2) delivery_status: 'sent' | 'retrying' | 'delivered' | 'failed' | 'undelivered'
--    (NULL para mensagens recebidas do cliente). Permite o painel mostrar
--    "não entregue".
-- 3) delivery_attempts: nº de tentativas da escala (reenvio → reinício → reenvio).

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "provider_message_id" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "delivery_status" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "delivery_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_provider_message_id_idx" ON "messages" ("provider_message_id");
