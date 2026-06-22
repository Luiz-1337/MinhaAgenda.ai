-- 016_data_hygiene_indexes.sql  (HIG-1, HIG-3, HIG-4)
-- Higiene de índices. Idempotente (IF [NOT] EXISTS). Escala atual é pequena
-- (messages = 768 kB), então CREATE INDEX simples basta (lock de ms);
-- não usamos CONCURRENTLY porque a migration pode rodar em transação.

-- HIG-1: FK messages.chat_id sem índice (1858 linhas → Seq Scan na abertura de conversa
-- e na montagem de contexto da IA). Composto (chat_id, created_at) cobre filtro + ORDER BY.
CREATE INDEX IF NOT EXISTS messages_chat_created_idx
  ON public.messages (chat_id, created_at);

-- HIG-4: FKs sem índice em tabelas VIVAS.
CREATE INDEX IF NOT EXISTS schedule_overrides_salon_idx
  ON public.schedule_overrides (salon_id);
-- chats já tem chats_kanban_idx (salon_id, kanban_column_id); o lookup por coluna do kanban
-- (FK isolada) precisa de índice próprio porque o composto começa por salon_id.
CREATE INDEX IF NOT EXISTS chats_kanban_column_idx
  ON public.chats (kanban_column_id);

-- HIG-3: dropar 4 índices redundantes (duplicam um UNIQUE existente; idx_scan=0).
DROP INDEX IF EXISTS public.payments_external_id_idx;       -- dup de payments_external_id_unique
DROP INDEX IF EXISTS public.salon_slug_idx;                 -- dup do UNIQUE de salons.slug
DROP INDEX IF EXISTS public.recovery_steps_order_idx;       -- dup de recovery_steps_flow_order_unique
DROP INDEX IF EXISTS public.agent_stats_salon_agent_idx;    -- dup de agent_stats_salon_agent_unique

DO $$
BEGIN
  RAISE NOTICE '016 OK: +3 índices (messages, schedule_overrides, chats), -4 redundantes';
END $$;
