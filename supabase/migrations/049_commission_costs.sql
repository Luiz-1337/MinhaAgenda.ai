-- 049_commission_costs.sql
-- Comissões: custo do atendimento abatendo a comissão
-- (docs/ROADMAP.md, fase 3, fatia 3e).
--
-- Até aqui a comissão é calculada sobre o valor do item, sem olhar o que o
-- atendimento custa ao salão. Esta migration cria o que falta para o custo entrar
-- na conta:
--
--   services.additional_cost         custo fixo do serviço por atendimento
--   commission_settings.cost_mode    quem arca com o custo (salão ou exceção do
--                                    profissional), como já existe para taxa e desconto
--   commission_entries.cost_amount   quanto do custo saiu da comissão daquela linha
--
-- O custo de um atendimento = custo adicional do serviço + custo estimado dos
-- produtos que o serviço consome (service_products, migration 048).
--
-- Decisões que o SQL carrega:
--   - `cost_mode` usa os mesmos quatro valores de taxa e desconto. NULL = segue o
--     salão, ou o padrão do sistema (regra em domain/commissions.ts).
--   - `cost_amount` é a PARTE do custo que coube ao profissional, já em reais — o
--     mesmo desenho de `fee_amount`. O que há a receber passa a ser
--     gross_amount − fee_amount − assistant_deduction − cost_amount.
--   - O custo nunca deixa a comissão negativa (CHECK) e só existe na linha de quem
--     executou: o auxiliar recebe o que a regra dele diz.
--   - Nenhuma linha existente muda: as colunas novas nascem em zero (ou NULL), e
--     nenhum serviço tem custo até alguém cadastrar.
--
-- Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 3e. Ela acrescenta uma coluna
-- em `services`, que TODO salão usa (inclusive o agente de IA lê serviços): o
-- código novo seleciona e insere `additional_cost`, e sem a coluna falharia em
-- qualquer ambiente. O código antigo continua funcionando depois da 049.

-- ---------------------------------------------------------------------------
-- services: custo adicional
-- ---------------------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS additional_cost numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_additional_cost_check;
ALTER TABLE public.services
  ADD CONSTRAINT services_additional_cost_check CHECK (additional_cost >= 0);

-- ---------------------------------------------------------------------------
-- commission_settings: quem arca com o custo
-- ---------------------------------------------------------------------------
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS cost_mode text;

ALTER TABLE public.commission_settings DROP CONSTRAINT IF EXISTS commission_settings_cost_mode_check;
ALTER TABLE public.commission_settings
  ADD CONSTRAINT commission_settings_cost_mode_check
  CHECK (cost_mode IS NULL OR cost_mode IN ('proportional', 'salon', 'professional', 'split'));

-- ---------------------------------------------------------------------------
-- commission_entries: o custo que saiu da comissão
-- ---------------------------------------------------------------------------
ALTER TABLE public.commission_entries
  ADD COLUMN IF NOT EXISTS cost_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.commission_entries DROP CONSTRAINT IF EXISTS commission_entries_cost_amount_check;
ALTER TABLE public.commission_entries
  ADD CONSTRAINT commission_entries_cost_amount_check CHECK (
    cost_amount >= 0
    -- O custo nunca passa do que sobrou depois da taxa e do auxiliar.
    AND cost_amount <= gross_amount - fee_amount - assistant_deduction
    -- Só a linha do profissional é abatida; a do auxiliar é o que ele recebe.
    AND (role = 'professional' OR cost_amount = 0)
  );

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  faltando text;
BEGIN
  SELECT string_agg(esperada.tabela || '.' || esperada.coluna, ', ') INTO faltando
    FROM (VALUES
      ('services', 'additional_cost'),
      ('commission_settings', 'cost_mode'),
      ('commission_entries', 'cost_amount')
    ) AS esperada(tabela, coluna)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = esperada.tabela
        AND c.column_name = esperada.coluna
   );

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION '049 FALHOU: coluna(s) ausente(s): %', faltando;
  END IF;

  -- Nenhum serviço existente ganha custo sozinho, e nenhuma comissão muda.
  IF EXISTS (SELECT 1 FROM public.commission_entries WHERE cost_amount <> 0) THEN
    RAISE NOTICE '049: há comissão com custo abatido (esperado só ao reaplicar)';
  END IF;

  RAISE NOTICE '049 OK: services.additional_cost, commission_settings.cost_mode, commission_entries.cost_amount';
END $$;
