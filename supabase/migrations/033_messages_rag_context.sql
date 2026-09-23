-- 033_messages_rag_context.sql
-- O que o RAG do Treinamento fez em cada resposta da IA.
--
-- POR QUE: o Treinamento entra por semelhança (corte 0,65, até 5 itens), e a busca
-- era muda — não havia como saber quais itens entraram, nem se o corte estava alto
-- demais. Indício de que está (23/09/2026): entre os próprios 11 itens da Liz, só o
-- par quase idêntico do metrô passa de 0,65; o resto fica em 0,62 ou menos. Uma
-- pergunta curta do cliente tende a ficar abaixo disso. Com este registro, o corte
-- é ajustado com dados de mensagens reais, e não no chute.
--
-- FORMATO (jsonb): { outcome, threshold, limit, candidates: [{ id, similarity,
-- included }] } — os itens mais parecidos, entrando ou não. Só ids e notas, NUNCA
-- o conteúdo dos itens. NULL = agente sem Treinamento, ou mensagem anterior a esta
-- coluna.
--
-- SEM ÍNDICE: a leitura é análise pontual (calibração), não consulta de produto.
--
-- ORDEM OBRIGATÓRIA: aplicar ANTES do deploy do código que declara a coluna no
-- schema do Drizzle. Com a coluna no schema e fora do banco, todo SELECT que lê
-- `messages` inteiro quebra.
--
-- Aditiva, nullable, sem default (não reescreve a tabela), idempotente.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS rag_context jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'messages'
       AND column_name = 'rag_context'
  ) THEN
    RAISE EXCEPTION '033 FALHOU: coluna messages.rag_context não foi criada';
  END IF;

  RAISE NOTICE '033 OK: messages.rag_context (jsonb, nullable)';
END $$;
