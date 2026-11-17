-- 050_stock_requests.sql
-- Estoque: solicitações de saída pelo profissional
-- (docs/ROADMAP.md, fase 4, fatia 4e).
--
-- O profissional pede um produto do estoque para uso próprio (levar para casa,
-- usar fora do atendimento). O salão aprova, o produto sai do estoque e o valor,
-- pelo "preço para profissional", é debitado no extrato de comissões.
--
--   products.requestable / professional_price   o produto pode ser solicitado, e por quanto
--   stock_requests                              a solicitação: quem, o quê, quanto, situação
--   stock_movements.kind = 'request'            a saída gerada pela aprovação
--   commission_adjustments.stock_request_id     o débito gerado pela aprovação
--
-- Decisões que o SQL carrega:
--   - A solicitação guarda o NOME do produto e o PREÇO da hora (`description`,
--     `unit_price`): mudar o preço para profissional depois não muda o que já foi
--     pedido.
--   - Aprovar grava a saída no estoque e o débito no extrato na mesma transação. As
--     duas linhas apontam para a solicitação com CASCADE: apagar a solicitação
--     desfaz as duas. Por isso o serviço barra apagar quando o débito já entrou num
--     pagamento de comissão.
--   - O débito é um VALE (`commission_adjustments.kind = 'advance'`) com
--     `stock_request_id` preenchido: abate o líquido como qualquer vale, e o
--     pagamento de comissões não precisa conhecer um tipo novo. O CHECK garante que
--     só vale aponta para solicitação.
--   - Solicitação sem valor (produto sem preço para profissional) não gera débito.
--   - Só `approved` tem quem decidiu e quando; `pending` e `rejected` diferem só
--     pela decisão.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 4e. Ela acrescenta colunas em
-- `products`, `stock_movements` e `commission_adjustments`, e o INSERT do Drizzle
-- lista todas as colunas: sem elas, cadastrar produto, movimentar estoque e lançar
-- vale falhariam com o código novo. O código antigo continua funcionando depois da
-- 050: as colunas novas têm padrão ou aceitam NULL.

-- ---------------------------------------------------------------------------
-- products: disponível para solicitação e preço para profissional
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requestable        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS professional_price numeric(12,2);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_professional_price_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_professional_price_check
  CHECK (professional_price IS NULL OR professional_price >= 0);

-- ---------------------------------------------------------------------------
-- stock_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- Sem ON DELETE, como sale_items: produto com solicitação não se apaga.
  product_id      uuid NOT NULL REFERENCES public.products(id),
  -- Quem vai levar o produto (e de quem sai o débito).
  professional_id uuid NOT NULL REFERENCES public.professionals(id),
  -- Cópia do nome na hora do pedido.
  description     text NOT NULL,
  quantity        numeric(12,3) NOT NULL,
  -- Preço para profissional na hora do pedido. Zero = sem custo para ele.
  unit_price      numeric(12,2) NOT NULL DEFAULT 0,
  total_amount    numeric(12,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending',
  notes           text,
  requested_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at      timestamp,
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT stock_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT stock_requests_quantity_check CHECK (quantity > 0),
  CONSTRAINT stock_requests_amounts_check CHECK (unit_price >= 0 AND total_amount >= 0),
  -- Pendente ainda não tem decisão; aprovada e recusada têm quando.
  CONSTRAINT stock_requests_decision_check CHECK ((status = 'pending') = (decided_at IS NULL))
);

-- A lista do salão, da mais recente para a mais antiga, e as pendentes primeiro.
CREATE INDEX IF NOT EXISTS stock_requests_salon_idx
  ON public.stock_requests (salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_requests_pending_idx
  ON public.stock_requests (salon_id, created_at DESC)
  WHERE status = 'pending';
-- As solicitações de um profissional (quem vê só as próprias).
CREATE INDEX IF NOT EXISTS stock_requests_professional_idx
  ON public.stock_requests (professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_requests_product_idx
  ON public.stock_requests (product_id);

ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_stock_requests ON public.stock_requests;
CREATE POLICY deny_all_stock_requests ON public.stock_requests
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.stock_requests FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- stock_movements: a saída da solicitação aprovada
-- ---------------------------------------------------------------------------
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS stock_request_id uuid
    REFERENCES public.stock_requests(id) ON DELETE CASCADE;

-- Os CHECKs ficam mais largos. DROP + ADD na mesma transação: nenhuma linha
-- existente deixa de valer.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_kind_check
  CHECK (kind IN ('in', 'out', 'adjustment', 'sale', 'purchase', 'consumption', 'request'));

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_quantity_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_quantity_check CHECK (
    quantity <> 0 AND
    (kind NOT IN ('in', 'purchase') OR quantity > 0) AND
    (kind NOT IN ('out', 'sale', 'consumption', 'request') OR quantity < 0)
  );

-- Só a saída de solicitação aponta para a solicitação.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_request_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_request_check CHECK (
    (kind = 'request') = (stock_request_id IS NOT NULL)
  );

-- Uma solicitação baixa o estoque uma vez só.
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_request_unique
  ON public.stock_movements (stock_request_id)
  WHERE stock_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- commission_adjustments: o débito da solicitação aprovada
-- ---------------------------------------------------------------------------
ALTER TABLE public.commission_adjustments
  ADD COLUMN IF NOT EXISTS stock_request_id uuid
    REFERENCES public.stock_requests(id) ON DELETE CASCADE;

-- O débito da retirada é sempre um vale.
ALTER TABLE public.commission_adjustments DROP CONSTRAINT IF EXISTS commission_adjustments_request_check;
ALTER TABLE public.commission_adjustments
  ADD CONSTRAINT commission_adjustments_request_check CHECK (
    stock_request_id IS NULL OR kind = 'advance'
  );

-- Uma solicitação gera um débito só.
CREATE UNIQUE INDEX IF NOT EXISTS commission_adjustments_request_unique
  ON public.commission_adjustments (stock_request_id)
  WHERE stock_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aberta   int;
  faltando text;
BEGIN
  IF to_regclass('public.stock_requests') IS NULL THEN
    RAISE EXCEPTION '050 FALHOU: tabela stock_requests não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stock_requests'::regclass) THEN
    RAISE EXCEPTION '050 FALHOU: stock_requests sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.stock_requests'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '050 FALHOU: % policy(ies) permissiva(s) em stock_requests', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.stock_requests', 'SELECT') OR
     has_table_privilege('authenticated', 'public.stock_requests', 'SELECT') THEN
    RAISE EXCEPTION '050 FALHOU: stock_requests ainda legível por anon/authenticated';
  END IF;

  SELECT string_agg(esperada.tabela || '.' || esperada.coluna, ', ') INTO faltando
    FROM (VALUES
      ('products', 'requestable'),
      ('products', 'professional_price'),
      ('stock_movements', 'stock_request_id'),
      ('commission_adjustments', 'stock_request_id')
    ) AS esperada(tabela, coluna)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = esperada.tabela
        AND c.column_name = esperada.coluna
   );

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION '050 FALHOU: coluna(s) ausente(s): %', faltando;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.stock_movements'::regclass
       AND conname = 'stock_movements_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%request%'
  ) THEN
    RAISE EXCEPTION '050 FALHOU: stock_movements_kind_check não aceita request';
  END IF;

  -- Nenhum produto existente passa a poder ser solicitado sozinho.
  IF EXISTS (SELECT 1 FROM public.products WHERE requestable) AND
     NOT EXISTS (SELECT 1 FROM public.stock_requests) THEN
    RAISE NOTICE '050: há produto disponível para solicitação e nenhuma solicitação (esperado só ao reaplicar)';
  END IF;

  RAISE NOTICE '050 OK: solicitação em products, stock_requests (RLS on, deny_all, REVOKE), saída em stock_movements, débito em commission_adjustments';
END $$;
