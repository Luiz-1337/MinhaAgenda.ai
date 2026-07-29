-- 024_manual_mode_provenance.sql
-- Rastreia QUANDO e POR QUE um chat entrou em modo manual, marca a origem humana
-- da mensagem, e cria a política de retomada automática da IA por salão.
--
-- Motivação: hoje `chats.is_manual` é um booleano sem história. Três caminhos o
-- ligam (eco do celular, IA esgotada, falha de entrega) e apenas UM lugar o
-- desliga: o botão "Passar para a IA" no painel. Um chat que virou manual por
-- falha de entrega fica manual para sempre até alguém reparar. E a fala vinda do
-- eco é gravada como role='assistant', indistinguível de uma resposta da IA — a
-- IA relê a fala do humano como se fosse dela, e não há como datar "quando o
-- humano falou" para uma regra por tempo.
--
-- ⚠️ HANDOFF data-platform. NÃO aplicar sem:
--   (1) BACKUP do banco;
--   (2) confirmar o schema REAL via list_tables(chats, messages, salons)
--       (migrations não-confiáveis neste repo; _journal Drizzle defasado);
--   (3) aprovação do dono.
-- Aplicar via Supabase CLI / apply_migration — NUNCA db:push/db:generate
-- (guard-migrations.mjs bloqueia). Estilo idempotente, espelhando a 019/020.

-- ---------------------------------------------------------------------------
-- 1. chats: quando e por que o modo manual começou
-- ---------------------------------------------------------------------------

-- NULL quando o chat está automático. Preenchido no instante da virada.
ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS manual_since timestamp;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS manual_reason text;

-- CHECK em vez de pgEnum (ALTER TYPE é rígido; db:generate congelado pelo guard).
-- 'human_echo'      = atendente respondeu pelo app do WhatsApp Business (Coexistência)
-- 'panel'           = dono clicou "Assumir manualmente" no painel
-- 'ai_exhausted'    = worker esgotou as tentativas e desistiu
-- 'delivery_failed' = escada de reenvio não conseguiu entregar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chats_manual_reason_check'
  ) THEN
    ALTER TABLE chats
      ADD CONSTRAINT chats_manual_reason_check
      CHECK (manual_reason IS NULL OR manual_reason IN (
        'human_echo', 'panel', 'ai_exhausted', 'delivery_failed'
      ));
  END IF;
END $$;

-- Backfill: chats JÁ em manual não têm data de virada. Usar updated_at é a melhor
-- aproximação disponível e evita que a retomada, ao ser ligada, trate um chat
-- antigo como "acabou de virar manual" (o que o deixaria parado mais um ciclo
-- inteiro). manual_reason fica NULL de propósito — não sabemos a causa histórica
-- e inventar uma seria pior que admitir a lacuna.
UPDATE chats
   SET manual_since = updated_at
 WHERE is_manual = true
   AND manual_since IS NULL;

-- A retomada varre por (is_manual, manual_since). Índice parcial: só as linhas
-- em manual interessam, e elas são a minoria.
CREATE INDEX IF NOT EXISTS chats_manual_since_idx
  ON chats (manual_since)
  WHERE is_manual = true;

-- ---------------------------------------------------------------------------
-- 2. messages: a fala é de humano ou da IA?
-- ---------------------------------------------------------------------------

-- role='assistant' cobre DOIS emissores muito diferentes: a IA e o humano (eco
-- do celular ou envio manual do painel). Sem distinguir, (a) a IA relê a fala do
-- humano como sua, (b) o painel não pode rotular quem falou, (c) não há como
-- datar a última fala humana.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS from_human boolean NOT NULL DEFAULT false;

-- Sem backfill: não há como saber retroativamente quais 'assistant' foram
-- humanas. `false` para o histórico é a leitura correta — a esmagadora maioria
-- veio da IA, e o eco só passou a existir agora.

-- ---------------------------------------------------------------------------
-- 3. salons: política de retomada automática
-- ---------------------------------------------------------------------------

-- Minutos de silêncio do humano após os quais a IA reassume o chat.
-- NULL = NUNCA retomar automaticamente, que é exatamente o comportamento de
-- hoje. Todos os salões existentes seguem inalterados até o dono configurar.
ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS ai_resume_after_minutes integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salons_ai_resume_after_minutes_check'
  ) THEN
    ALTER TABLE salons
      ADD CONSTRAINT salons_ai_resume_after_minutes_check
      CHECK (ai_resume_after_minutes IS NULL OR ai_resume_after_minutes BETWEEN 5 AND 20160);
  END IF;
END $$;

COMMENT ON COLUMN chats.manual_since IS 'Quando o chat entrou em modo manual. NULL = automático.';
COMMENT ON COLUMN chats.manual_reason IS 'O que ligou o modo manual: human_echo | panel | ai_exhausted | delivery_failed.';
COMMENT ON COLUMN messages.from_human IS 'True quando a fala com role=assistant veio de um humano (eco do app ou envio manual), não da IA.';
COMMENT ON COLUMN salons.ai_resume_after_minutes IS 'Minutos de silêncio humano após os quais a IA reassume o chat. NULL = nunca retomar.';
