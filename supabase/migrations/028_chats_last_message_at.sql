-- 028_chats_last_message_at.sql
-- O relógio da CONVERSA, separado do relógio da LINHA.
--
-- Situação antes desta migration: a lista de chats e o board do kanban ordenavam
-- por `chats.updated_at`, mas exibiam o horário da última mensagem. São coisas
-- diferentes — `updated_at` significa "a linha foi mexida", e é carimbado por
-- coisas que não geram mensagem nenhuma:
--   - mover o cartão no kanban        (actions/kanban.ts moveChatToKanbanColumn)
--   - a IA classificar o chat         (mcp-server SetChatKanbanColumnUseCase)
--   - ligar/desligar o modo manual    (actions/chats.ts, delivery-retry.worker,
--                                      message-processor)
--   - atribuir o agente               (chat.service.ts)
-- Efeito em produção (30/jul/2026, Spettacolo): três conversas foram arrastadas
-- para "Concluídas" às 18:49 e pularam para o TOPO da lista, acima de conversas
-- de horas atrás — uma delas com a última mensagem de 24/jun, 870h de defasagem.
-- O defeito é de mão única: como salvar mensagem também mexe em `updated_at`,
-- ele nunca fica MENOR que a última mensagem, então um chat só sobe indevidamente.
--
-- `last_message_at` passa a ser esse relógio, e por construção é sempre igual a
-- max(messages.created_at) do chat — ver o trigger no passo 4.
--
-- Puramente ADITIVA: nenhuma coluna é removida ou alterada. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) A coluna
-- ---------------------------------------------------------------------------
-- NULL-able de propósito: existe chat sem nenhuma mensagem (criado no primeiro
-- webhook, antes da primeira fala ser persistida). NULL = "conversa nunca falou",
-- e é exatamente o critério que tira o chat da lista — hoje isso é feito em JS,
-- filtrando quem não apareceu na janela de mensagens buscada.
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS last_message_at timestamp;

-- ---------------------------------------------------------------------------
-- 2) Backfill
-- ---------------------------------------------------------------------------
-- Uma passada, agregando de uma vez (não correlacionado por linha).
-- Só toca quem está NULL, então rodar de novo é inócuo.
WITH ultima AS (
  SELECT chat_id, max(created_at) AS mx
    FROM public.messages
   GROUP BY chat_id
)
UPDATE public.chats c
   SET last_message_at = u.mx
  FROM ultima u
 WHERE u.chat_id = c.id
   AND c.last_message_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Índice
-- ---------------------------------------------------------------------------
-- Serve exatamente a consulta da lista:
--   WHERE salon_id = ? AND last_message_at IS NOT NULL
--   ORDER BY last_message_at DESC LIMIT 100
CREATE INDEX IF NOT EXISTS chats_salon_last_message_idx
  ON public.chats (salon_id, last_message_at DESC);

-- ---------------------------------------------------------------------------
-- 4) Quem mantém o valor: o banco, não o app
-- ---------------------------------------------------------------------------
-- Deliberadamente um trigger e não um UPDATE no `saveMessage`. A causa-raiz do
-- bug foi um timestamp mantido pela aplicação divergir do fato; um timestamp que
-- só pode ser escrito junto com o fato não tem como divergir. Também cobre os
-- escritores que NÃO passam pelo `saveMessage`: os seeds em
-- packages/db/scripts/*.mjs inserem em `messages` com SQL cru, e sem o trigger
-- todo chat semeado nasceria invisível na lista.
--
-- Monotônico (só avança): inserir mensagem histórica com created_at antigo — um
-- import do Trinks, um replay — não pode fazer a conversa "voltar no tempo".
-- SECURITY INVOKER (o padrão, explicitado aqui de propósito): quem insere
-- mensagem em produção é o Drizzle, que já tem UPDATE em `chats`. SECURITY
-- DEFINER seria privilégio a mais sem necessidade, e a 015 existe justamente
-- para tirar EXECUTE de funções SECURITY DEFINER de anon/authenticated.
-- `search_path` fixo mesmo assim — função de trigger não deve depender do
-- search_path de quem disparou.
CREATE OR REPLACE FUNCTION public.chats_touch_last_message_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.chats
     SET last_message_at = NEW.created_at
   WHERE id = NEW.chat_id
     AND (last_message_at IS NULL OR last_message_at < NEW.created_at);
  RETURN NULL;
END $$;

-- Alinha com a postura da 015: nada em `public` fica chamável por anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.chats_touch_last_message_at() FROM anon, authenticated, public;

-- Nota de escopo: não há trigger de DELETE. Apagar mensagem deixaria
-- `last_message_at` adiantado, mas o único caminho que apaga mensagem é a
-- limpeza do eval (__tests__/eval/runner/seed.ts), que apaga o chat junto.
DROP TRIGGER IF EXISTS messages_touch_chat_last_message_at ON public.messages;
CREATE TRIGGER messages_touch_chat_last_message_at
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.chats_touch_last_message_at();

-- ---------------------------------------------------------------------------
-- Verificação (schema.ts NÃO é a verdade do banco — conferir aqui)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  divergentes int;
  tem_trigger boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'chats'
       AND column_name = 'last_message_at'
  ) THEN
    RAISE EXCEPTION '028 FALHOU: coluna chats.last_message_at não foi criada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'messages_touch_chat_last_message_at'
       AND NOT tgisinternal
  ) INTO tem_trigger;

  IF NOT tem_trigger THEN
    RAISE EXCEPTION '028 FALHOU: trigger messages_touch_chat_last_message_at ausente';
  END IF;

  -- A invariante inteira em uma asserção: para TODO chat com mensagem,
  -- last_message_at = max(messages.created_at). Vale como prova do backfill
  -- agora e como detector de drift em qualquer execução futura.
  SELECT count(*) INTO divergentes
    FROM public.chats c
    JOIN (
      SELECT chat_id, max(created_at) AS mx FROM public.messages GROUP BY chat_id
    ) m ON m.chat_id = c.id
   WHERE c.last_message_at IS DISTINCT FROM m.mx;

  IF divergentes > 0 THEN
    RAISE EXCEPTION '028 FALHOU: % chat(s) com last_message_at != max(messages.created_at)', divergentes;
  END IF;

  RAISE NOTICE '028 OK: chats.last_message_at + backfill + índice + trigger (invariante conferida)';
END $$;
