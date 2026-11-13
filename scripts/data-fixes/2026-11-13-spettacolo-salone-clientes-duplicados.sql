-- 2026-11-13 — Spettacolo Salone (Fabiano Eber): unificar 4 clientes em dois cadastros cada
--
-- APLICADO EM PRODUÇÃO em 13/nov/2026 às 01:00 (Brasília) / 04:00 UTC, pelo dono do projeto,
-- antes da migration 035. Conferido depois: os 4 cadastros do WhatsApp saíram; os 4 que
-- ficaram estão com o telefone no formato do WhatsApp, mantêm agendamento e vínculo com a
-- Belasis, casam cada um com uma conversa e receberam a origem do lead na carga da 035.
-- Rodar este arquivo de novo não muda nada.
--
-- AJUSTE DE DADOS DE PRODUÇÃO. Não é migration: roda uma vez, no salão do Fabiano, por ID.
--
-- O QUE ACONTECEU: em 29/out a recepção cadastrou estas clientes pelo painel, e o painel
-- gravou o telefone sem o DDI (10 ou 11 dígitos). Quando elas escreveram pelo WhatsApp, a
-- busca comparou o texto exato do número (13 ou 12 dígitos, com DDI), não achou e criou um
-- SEGUNDO cadastro. O do painel ficou com o agendamento e o vínculo com a Belasis; o do
-- WhatsApp, com a conversa. Falando com o segundo, a IA não enxerga os agendamentos do
-- primeiro.
--
-- O código novo (customer-phone.service.ts) não cria mais duplicados, mas não junta os que
-- já existem — é o que este arquivo faz.
--
-- COMO: para cada par, fica o cadastro do PAINEL (tem o nome completo digitado pela
-- recepção, o histórico de agendamento e o vínculo com a Belasis) e sai o do WhatsApp, que
-- conferi em 13/nov: nenhum agendamento, nota, etiqueta, lista de espera, campanha ou
-- vínculo — só a conversa, que é ligada pelo TELEFONE e continua valendo, porque o cadastro
-- que fica passa a ter o número no formato do WhatsApp. (Um deles tem uma linha de perfil
-- Trinks vazia, que sai junto.)
--
-- RODAR ANTES da carga de origem do lead da migration 035 (ou rodar a 035 de novo depois —
-- ela é idempotente): a origem é gravada pelo telefone da conversa.
--
-- Seguro para rodar de novo: cada passo só age se o par ainda estiver como em 13/nov.
-- Os outros 5 pares duplicados (em 3 outros salões) não são tocados aqui.

BEGIN;

DO $$
DECLARE
  salao constant uuid := 'd4067a85-0c76-42d0-94c8-448f0ed21fcd';
  par record;
  dependentes int;
  telefone_whatsapp text;
  feitos int := 0;
BEGIN
  FOR par IN
    SELECT * FROM (VALUES
      -- (fica: cadastro do painel,                 sai: cadastro do WhatsApp)
      ('09f76fe3-4917-4e35-9174-86eb72a45d0a'::uuid, 'a445106c-42e8-4f2f-8509-6fb3963ca981'::uuid),
      ('002cf8c8-01d9-4cda-9e53-b01e9cefd0cb'::uuid, 'a12a36e4-f0b4-4f8e-8489-76726d026856'::uuid),
      ('750fca17-f636-4914-9561-2fe5de7558c5'::uuid, 'c49cefe1-76ca-4bbe-9d84-c659b4c98603'::uuid),
      ('c93fb5d6-5851-4ae4-b632-5accf6bec7f6'::uuid, '0631c26b-652c-4d64-a354-80941f04f1d5'::uuid)
    ) AS pares(fica, sai)
  LOOP
    -- Já unificado numa rodada anterior: o que sairia não existe mais.
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.customers WHERE id = par.sai AND salon_id = salao);

    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = par.fica AND salon_id = salao) THEN
      RAISE EXCEPTION 'O cadastro que deveria ficar (%) não existe mais neste salão. Nada foi alterado.', par.fica;
    END IF;

    -- Os dois têm de ser o MESMO número (DDD + 8 últimos dígitos).
    IF (SELECT right(regexp_replace(phone, '\D', '', 'g'), 8) FROM public.customers WHERE id = par.fica)
       IS DISTINCT FROM
       (SELECT right(regexp_replace(phone, '\D', '', 'g'), 8) FROM public.customers WHERE id = par.sai) THEN
      RAISE EXCEPTION 'Os cadastros % e % não têm mais o mesmo telefone. Nada foi alterado.', par.fica, par.sai;
    END IF;

    -- O que sai não pode ter ganhado nada desde a conferência: se ganhou (um agendamento
    -- feito pela IA nesse meio-tempo, por exemplo), para tudo e alguém olha o par à mão.
    SELECT (SELECT count(*) FROM public.appointments WHERE client_id = par.sai)
         + (SELECT count(*) FROM public.customer_notes WHERE customer_id = par.sai)
         + (SELECT count(*) FROM public.customer_tag_assignments WHERE customer_id = par.sai)
         + (SELECT count(*) FROM public.waiting_list WHERE client_id = par.sai)
         + (SELECT count(*) FROM public.campaign_recipients WHERE customer_id = par.sai)
         + (SELECT count(*) FROM public.campaign_messages WHERE customer_id = par.sai)
         + (SELECT count(*) FROM public.integration_external_refs WHERE internal_id = par.sai)
      INTO dependentes;
    IF dependentes > 0 THEN
      RAISE EXCEPTION 'O cadastro do WhatsApp % ganhou % registro(s) desde 13/nov (agendamento, nota, vínculo...). Nada foi alterado: este par precisa ser juntado à mão.', par.sai, dependentes;
    END IF;

    -- O cadastro que fica recebe o telefone no formato do WhatsApp (o do que sai).
    -- Primeiro apaga o que sai: o telefone é único por salão.
    SELECT phone INTO telefone_whatsapp FROM public.customers WHERE id = par.sai AND salon_id = salao;
    DELETE FROM public.customers WHERE id = par.sai AND salon_id = salao;
    UPDATE public.customers
       SET phone = telefone_whatsapp, updated_at = now()
     WHERE id = par.fica AND salon_id = salao;

    feitos := feitos + 1;
  END LOOP;

  RAISE NOTICE 'OK: % par(es) unificado(s) nesta rodada (4 no total; os demais já estavam unificados).', feitos;
END $$;

COMMIT;
