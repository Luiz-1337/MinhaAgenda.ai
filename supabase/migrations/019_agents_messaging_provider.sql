-- 019_agents_messaging_provider.sql
-- Colunas para o canal WhatsApp Cloud API (Meta) por agente, espelhando o modelo
-- da Evolution (que resolve o tenant por instanceName). Aqui o webhook /cloud
-- resolve o agente pelo phone_number_id.
--
-- ⚠️ HANDOFF data-platform. NÃO aplicar sem:
--   (1) BACKUP do banco;
--   (2) confirmar o schema REAL via list_tables(agents) + pg_indexes
--       (migrations não-confiáveis neste repo; _journal Drizzle defasado);
--   (3) SELECT por duplicatas de phone_number_id antes do índice UNIQUE;
--   (4) aprovação do dono.
-- Aplicar via Supabase CLI / apply_migration — NUNCA db:push/db:generate
-- (guard-migrations.mjs bloqueia; recriaria 0020-0041 e dropa 7 constraints).
-- Estilo idempotente espelhando 008_add_agents_whatsapp_columns.sql.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS messaging_provider text NOT NULL DEFAULT 'evolution';

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS whatsapp_waba_id text;

-- CHECK em vez de pgEnum (ALTER TYPE é rígido; db:generate congelado pelo guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_messaging_provider_check'
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT agents_messaging_provider_check
      CHECK (messaging_provider IN ('evolution', 'cloud'));
  END IF;
END $$;

COMMENT ON COLUMN agents.messaging_provider IS
  'Canal de WhatsApp ativo: evolution (padrão) | cloud. Flag de rollout/rollback por-agente.';
COMMENT ON COLUMN agents.whatsapp_phone_number_id IS
  'phone_number_id da WhatsApp Cloud API (Meta). Chave de resolução de tenant do webhook /cloud. UNIQUE parcial.';
COMMENT ON COLUMN agents.whatsapp_waba_id IS
  'WhatsApp Business Account ID (Meta). Reconciliação / futuro multi-WABA.';

-- ⚠️ Rodar FORA de transação (CREATE INDEX CONCURRENTLY falha dentro de BEGIN/COMMIT;
-- apply_migration costuma envelopar — aplicar este statement separadamente).
-- Índice UNIQUE PARCIAL: impede dois agentes no mesmo número (vazamento cross-tenant),
-- permite vários agentes ainda sem número configurado.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS agents_whatsapp_phone_number_id_unique
  ON agents (whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL;

-- NÃO adicionar coluna de token: o token de envio é o da plataforma
-- (env WHATSAPP_CLOUD_TOKEN, System User). Token por-salão exigiria cifra em
-- repouso, que NÃO existe no repo (ENCRYPTION_KEY é required em env.ts mas tem
-- ZERO uso; tokens OAuth atuais estão em plaintext).
