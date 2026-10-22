-- 034_integration_external_refs.sql
-- De-para entre IDs locais e IDs de um sistema externo.
--
-- Primeiro uso: a agenda oficial do salão (Belasis). Para criar um agendamento lá,
-- o profissional, o serviço e o cliente daqui precisam virar os IDs de lá — e o
-- agendamento criado precisa guardar o ID externo para ser remarcado/cancelado.
--
-- Uma tabela só, em vez de mais uma coluna `<provider>_id` em professionals,
-- services, customers e appointments a cada integração nova (appointments já tem
-- google_event_id e trinks_event_id). `internal_id` é polimórfico — sem FK —
-- e aponta para a tabela que `entity_type` indica.
--
-- Unicidade nos dois sentidos, por salão + provedor + tipo: um profissional daqui
-- é UM profissional de lá, e vice-versa.
--
-- Padrão multi-tenant de 020/029: salon_id + FK cascade + RLS ON + policy
-- deny_all + REVOKE de anon/authenticated (acesso só via Drizzle).
-- Aditiva. Idempotente. Só é lida/escrita para o salão que conecta uma agenda
-- oficial em Integrações (vínculo, agendamento, sincronização).

CREATE TABLE IF NOT EXISTS public.integration_external_refs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id    uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  provider    text NOT NULL,
  entity_type text NOT NULL,
  internal_id uuid NOT NULL,
  external_id text NOT NULL,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT integration_external_refs_entity_type_check
    CHECK (entity_type IN ('professional', 'service', 'customer', 'appointment'))
);

-- Daqui → de lá (o caminho quente: montar a chamada à API externa).
CREATE UNIQUE INDEX IF NOT EXISTS integration_external_refs_internal_unique
  ON public.integration_external_refs (salon_id, provider, entity_type, internal_id);
-- De lá → daqui (webhook/sync de volta).
CREATE UNIQUE INDEX IF NOT EXISTS integration_external_refs_external_unique
  ON public.integration_external_refs (salon_id, provider, entity_type, external_id);

ALTER TABLE public.integration_external_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_integration_external_refs ON public.integration_external_refs;
CREATE POLICY deny_all_integration_external_refs ON public.integration_external_refs
  FOR ALL USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.integration_external_refs FROM anon, authenticated;

DO $$
DECLARE
  aberta int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'integration_external_refs'
  ) THEN
    RAISE EXCEPTION '034 FALHOU: tabela integration_external_refs não foi criada';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.integration_external_refs'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '034 FALHOU: integration_external_refs tem policy permissiva';
  END IF;

  RAISE NOTICE '034 OK: integration_external_refs (RLS on, deny_all, REVOKE anon/authenticated)';
END $$;
