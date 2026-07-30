-- 031_messages_ad_referral.sql
-- Origem de anúncio (Click-to-WhatsApp) da mensagem que a trouxe.
--
-- POR QUE: a Meta manda `messages[0].referral` UMA única vez — na primeira mensagem
-- de uma conversa nascida de clique em anúncio — com o título e o texto do anúncio e
-- o `ctwa_clid` (chave de atribuição de conversão). O código descartava tudo. O
-- efeito não era teórico: nos dois primeiros leads pagos (30/07) a IA respondeu
-- "sobre qual serviço você quer saber mais?" a quem tinha acabado de clicar num
-- anúncio que já dizia o serviço, e os dois abandonaram. Descartado aqui, o dado
-- não existe em lugar nenhum para recuperar depois.
--
-- NA MENSAGEM, e não no chat: o fato é "esta mensagem nasceu deste anúncio". No
-- chat seria preciso escolher entre sobrescrever (perde o primeiro anúncio) e
-- manter o primeiro (a IA perde o anúncio atual num segundo clique). A mensagem
-- não força essa escolha, e a atribuição por chat sai por query.
--
-- SEM ÍNDICE por ora: o volume de linhas com valor não-nulo é o de leads de
-- anúncio (2 até hoje), e não há consulta em produção que filtre por ele. Quando a
-- tela de atribuição existir, um índice PARCIAL em `WHERE ad_referral IS NOT NULL`
-- é o que serve — nunca um GIN na tabela inteira.
--
-- Aditiva, nullable, idempotente. O código NÃO depende desta migration para
-- funcionar: o contexto do anúncio chega à IA pelo payload do job, e a gravação
-- aqui é não-fatal (loga e segue se a coluna não existir). Aplicar esta migration
-- só liga a persistência/atribuição.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS ad_referral jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'messages'
       AND column_name = 'ad_referral'
  ) THEN
    RAISE EXCEPTION '031 FALHOU: coluna messages.ad_referral não foi criada';
  END IF;

  RAISE NOTICE '031 OK: messages.ad_referral (jsonb, nullable)';
END $$;
