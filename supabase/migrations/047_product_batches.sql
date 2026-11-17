-- 047_product_batches.sql
-- Estoque: lotes e validades
-- (docs/ROADMAP.md, fase 4, fatia 4c).
--
-- Até aqui o estoque sabe QUANTO há de cada produto, mas não QUANDO vence. Esta
-- migration cria o registro de lotes:
--
--   product_batches   um lote de um produto: código, fabricação, validade e a
--                     quantidade que entrou com ele
--
-- Decisões que o SQL carrega:
--   - O lote guarda o que ENTROU (`quantity`), não o que resta. O que resta de cada
--     lote não é gravado: é calculado a partir do saldo do produto, supondo que sai
--     primeiro o que vence primeiro (regra em domain/batches.ts). Assim a venda em
--     comanda não precisa escolher lote, e um acerto de inventário corrige os lotes
--     junto com o saldo.
--   - O lote pode nascer de uma entrada (`stock_movement_id`: entrada manual ou
--     item de compra) ou ser registrado solto, para o que já estava na prateleira.
--     CASCADE de propósito: excluir a compra apaga a entrada, e o lote que veio
--     com ela vai junto.
--   - Lote sem código é aceito (o salão pode querer só a validade), mas tem que
--     ter código ou validade: lote sem os dois não diz nada.
--   - Nada muda em `stock_movements`: o vínculo fica do lado do lote.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 4c. A tela de Estoque passa a
-- consultar esta tabela (aviso de lotes vencendo); sem ela, a tela falha nos salões
-- com o módulo `inventory` ligado. Nenhuma tabela existente muda.

CREATE TABLE IF NOT EXISTS public.product_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id          uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Código do lote impresso na embalagem. NULL = o salão registrou só a validade.
  code              text,
  -- Dias de calendário.
  manufactured_on   date,
  expires_on        date,
  -- O que entrou com este lote. O que resta é calculado.
  quantity          numeric(12,3) NOT NULL,
  notes             text,
  -- A entrada (manual ou de compra) que trouxe o lote. NULL = registrado solto.
  stock_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE CASCADE,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  CONSTRAINT product_batches_quantity_check CHECK (quantity > 0),
  CONSTRAINT product_batches_identity_check CHECK (
    (code IS NOT NULL AND length(btrim(code)) > 0) OR expires_on IS NOT NULL
  ),
  CONSTRAINT product_batches_dates_check CHECK (
    manufactured_on IS NULL OR expires_on IS NULL OR manufactured_on <= expires_on
  )
);

-- Os lotes do salão por validade: o que vence primeiro aparece primeiro.
CREATE INDEX IF NOT EXISTS product_batches_salon_expiry_idx
  ON public.product_batches (salon_id, expires_on);
-- Os lotes de um produto.
CREATE INDEX IF NOT EXISTS product_batches_product_idx
  ON public.product_batches (product_id, expires_on);
-- Uma entrada traz no máximo um lote.
CREATE UNIQUE INDEX IF NOT EXISTS product_batches_movement_unique
  ON public.product_batches (stock_movement_id)
  WHERE stock_movement_id IS NOT NULL;

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_product_batches ON public.product_batches;
CREATE POLICY deny_all_product_batches ON public.product_batches
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.product_batches FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aberta int;
BEGIN
  IF to_regclass('public.product_batches') IS NULL THEN
    RAISE EXCEPTION '047 FALHOU: tabela product_batches não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_batches'::regclass) THEN
    RAISE EXCEPTION '047 FALHOU: product_batches sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.product_batches'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '047 FALHOU: % policy(ies) permissiva(s) em product_batches', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.product_batches', 'SELECT') OR
     has_table_privilege('authenticated', 'public.product_batches', 'SELECT') THEN
    RAISE EXCEPTION '047 FALHOU: product_batches ainda legível por anon/authenticated';
  END IF;

  RAISE NOTICE '047 OK: product_batches (RLS on, deny_all, REVOKE)';
END $$;
