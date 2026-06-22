-- 017_pgvector_hnsw.sql  (HIG-5)
-- Índice de similaridade HNSW para o RAG. Hoje agent_knowledge_base só tem btree em
-- agent_id; sem índice de similaridade o RAG não escala. Em 18 linhas não é urgente.
-- HNSW (não IVFFlat) evita re-treino de listas conforme o dado cresce por tenant.
--
-- ATENÇÃO — operador de distância: usar a MESMA família do operador que a query do RAG
-- usa (rag-context.service.ts). vector_cosine_ops casa com o operador `<=>` (cosine).
-- Se a busca usa `<->` (L2) ou `<#>` (inner product), troque para vector_l2_ops /
-- vector_ip_ops, senão o índice NÃO será usado pelo planner. CONFIRMAR com ai-agent
-- antes de aplicar. Em runtime, recall é ajustável por `SET hnsw.ef_search`.
--
-- Idempotente.

CREATE INDEX IF NOT EXISTS agent_kb_embedding_hnsw_idx
  ON public.agent_knowledge_base
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

DO $$
BEGIN
  RAISE NOTICE '017 OK: índice HNSW em agent_knowledge_base (confirme o operador de distância!)';
END $$;
