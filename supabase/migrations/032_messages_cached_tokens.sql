-- 032_messages_cached_tokens.sql
-- Quantos tokens de entrada de cada resposta da IA vieram do cache de prompt da OpenAI.
--
-- POR QUE: desde 4c9c9d2 (23/09/2026) o system prompt é reenviado em TODO round do
-- loop de tools — a OpenAI não o carrega pelo previous_response_id, e sem o reenvio
-- a resposta escrita depois de uma tool saía sem instrução nenhuma. O reenvio é o
-- prefixo da requisição e cai no cache, que a OpenAI cobra a 10% do preço de entrada.
-- Mas o crédito do salão era calculado sobre `total_tokens` inteiro, então cada
-- mensagem com tool passava a consumir mais crédito por um custo que quase não
-- existe. Decisão do dono (23/09): token de cache conta 1/10 no crédito.
--
-- NA MENSAGEM, ao lado de total_tokens: o crédito é recalculado a partir de
-- `messages` em três lugares (débito ao vivo, dashboard, cron stats-sync); os três
-- precisam do mesmo número para não divergir.
--
-- NULL = mensagem anterior a esta coluna (ou sem uso de IA): conta como 0 tokens de
-- cache, ou seja, o histórico continua valendo exatamente o que valia.
--
-- ORDEM OBRIGATÓRIA: aplicar ANTES do deploy do código que declara a coluna no
-- schema do Drizzle. Com a coluna no schema e fora do banco, todo SELECT que lê
-- `messages` inteiro quebra.
--
-- Aditiva, nullable, sem default (não reescreve a tabela), idempotente.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS cached_tokens integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'messages'
       AND column_name = 'cached_tokens'
  ) THEN
    RAISE EXCEPTION '032 FALHOU: coluna messages.cached_tokens não foi criada';
  END IF;

  RAISE NOTICE '032 OK: messages.cached_tokens (integer, nullable)';
END $$;
