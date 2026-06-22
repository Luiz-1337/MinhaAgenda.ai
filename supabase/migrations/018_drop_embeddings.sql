-- 018_drop_embeddings.sql  (AI-4) — STAGED: aplicar SOMENTE após o deploy da limpeza de código
-- A tabela `embeddings` está MORTA: 0 linhas, 0 uso de aplicação. O RAG real usa
-- agent_knowledge_base. Foi a tabela RAG original (migration 0007), substituída pela
-- 0016 e nunca removida.
--
-- ORDEM OBRIGATÓRIA (senão quebra com "relation does not exist"):
--   1) Deploy do código que remove as referências a `embeddings`
--      (scripts copy-salon-config.mjs / clean-solo-account.mjs / reset.mjs + schema.ts).
--   2) SÓ ENTÃO aplicar esta migration.
--
-- Backup recomendado antes (mesmo com 0 linhas): pg_dump -t public.embeddings (auditoria).
-- A única dependência é a auto-FK embeddings.agent_id -> agents.id (sai junto no CASCADE).
-- Idempotente.

DROP TABLE IF EXISTS public.embeddings CASCADE;

DO $$
BEGIN
  RAISE NOTICE '018 OK: tabela embeddings removida (morta; RAG usa agent_knowledge_base)';
END $$;
