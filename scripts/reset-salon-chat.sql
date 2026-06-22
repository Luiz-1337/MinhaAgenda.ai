-- ===========================================================================
-- Reset de CHAT de um salão  —  salão 0e5d76eb-3e1e-4463-bc30-8d3aba663b81
-- (Spettacolo Salone / Cris Ferreira)
-- ===========================================================================
-- APAGA:      conversas (chats) + todas as mensagens (messages) do salão.
-- PRESERVA:   agente (agents) e base de conhecimento, colunas do kanban
--             (chat_kanban_columns), clientes/CRM (customers), perfis Trinks
--             (customer_trinks_profile), leads e integrações (salon_integrations).
--
-- Notas:
--  - messages.chat_id tem ON DELETE CASCADE -> apagar o chat já apaga as msgs;
--    apagamos explícito só para contar.
--  - chats.agent_id e chats.kanban_column_id são "ON DELETE SET NULL", mas como
--    apagamos a LINHA do chat inteira, o agente e o kanban não são tocados.
--  - Nenhuma outra tabela referencia chats/messages (verificado no schema).
--  - Efeito colateral útil: zera chats que estavam em isManual=true (handoff
--    manual da escada de entrega), fazendo o bot voltar a responder do zero.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- PASSO 1 — DRY RUN (rode SÓ isto primeiro e confira o nome do salão + volume)
-- ---------------------------------------------------------------------------
SELECT
  s.id,
  s.name,
  (SELECT count(*) FROM chats c WHERE c.salon_id = s.id) AS total_chats,
  (SELECT count(*) FROM messages m
     WHERE m.chat_id IN (SELECT id FROM chats WHERE salon_id = s.id)) AS total_mensagens
FROM salons s
WHERE s.id = '0e5d76eb-3e1e-4463-bc30-8d3aba663b81';


-- ---------------------------------------------------------------------------
-- PASSO 2 — APLICAR (rode este bloco só depois de conferir o PASSO 1)
-- ---------------------------------------------------------------------------
BEGIN;

WITH alvo AS (
  SELECT id FROM chats WHERE salon_id = '0e5d76eb-3e1e-4463-bc30-8d3aba663b81'
)
DELETE FROM messages WHERE chat_id IN (SELECT id FROM alvo);

DELETE FROM chats WHERE salon_id = '0e5d76eb-3e1e-4463-bc30-8d3aba663b81';

-- Confirmação: ambos devem voltar 0.
SELECT
  (SELECT count(*) FROM chats WHERE salon_id = '0e5d76eb-3e1e-4463-bc30-8d3aba663b81') AS chats_restantes,
  (SELECT count(*) FROM messages m
     WHERE m.chat_id IN (SELECT id FROM chats WHERE salon_id = '0e5d76eb-3e1e-4463-bc30-8d3aba663b81')) AS mensagens_restantes;

COMMIT;
-- Se os números acima NÃO baterem com o esperado, troque COMMIT por ROLLBACK
-- e nada terá sido alterado.
