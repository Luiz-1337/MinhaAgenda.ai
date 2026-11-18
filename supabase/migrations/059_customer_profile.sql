-- 059_customer_profile.sql
-- Ficha do cliente completa: dados cadastrais que hoje não têm onde morar
-- (docs/ROADMAP.md, fase 7, fatia 7a).
--
--   customers   + nascimento, CPF, gênero, endereço e "como conheceu"
--
-- Decisões que o SQL carrega:
--   - Tudo opcional (NULL): o cadastro do WhatsApp continua nascendo só com nome
--     e telefone.
--   - CPF só com os 11 dígitos, e único por salão — duas fichas com o mesmo CPF
--     são a mesma pessoa cadastrada duas vezes. O dígito verificador é conferido
--     no código (domain/customer-profile.ts), não aqui.
--   - CEP só com os 8 dígitos; UF com 2 letras maiúsculas.
--   - Nascimento não pode ser no futuro nem antes de 1900.
--
-- MEXE em tabela existente (customers), só acrescentando colunas sem DEFAULT:
-- nenhuma linha é regravada. Aplicar ANTES de publicar o código — o Drizzle lista
-- todas as colunas no INSERT.
-- Idempotente.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS birth_date         date,
  ADD COLUMN IF NOT EXISTS cpf                text,
  -- 'female' | 'male' | 'other'
  ADD COLUMN IF NOT EXISTS gender             text,
  ADD COLUMN IF NOT EXISTS zip_code           text,
  ADD COLUMN IF NOT EXISTS address_street     text,
  ADD COLUMN IF NOT EXISTS address_number     text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_district   text,
  ADD COLUMN IF NOT EXISTS address_city       text,
  ADD COLUMN IF NOT EXISTS address_state      text,
  -- Como o cliente conheceu o salão (texto curto, livre).
  ADD COLUMN IF NOT EXISTS referral_source    text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_birth_date_check') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_birth_date_check
      CHECK (birth_date IS NULL OR (birth_date >= DATE '1900-01-01' AND birth_date <= CURRENT_DATE + 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_cpf_check') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_cpf_check
      CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_gender_check') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_gender_check
      CHECK (gender IS NULL OR gender IN ('female', 'male', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_zip_code_check') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_zip_code_check
      CHECK (zip_code IS NULL OR zip_code ~ '^[0-9]{8}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_address_state_check') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_address_state_check
      CHECK (address_state IS NULL OR address_state ~ '^[A-Z]{2}$');
  END IF;
END $$;

-- Um CPF por salão.
CREATE UNIQUE INDEX IF NOT EXISTS customers_salon_cpf_unique
  ON public.customers (salon_id, cpf) WHERE cpf IS NOT NULL;

-- Aniversariantes do salão, por mês e dia (a lista de aniversários vem depois).
CREATE INDEX IF NOT EXISTS customers_salon_birthday_idx
  ON public.customers (salon_id, (extract(month FROM birth_date)), (extract(day FROM birth_date)))
  WHERE birth_date IS NOT NULL;

DO $$
DECLARE
  colunas int;
BEGIN
  SELECT count(*) INTO colunas
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'customers'
     AND column_name IN ('birth_date', 'cpf', 'gender', 'zip_code', 'address_street', 'address_number',
                         'address_complement', 'address_district', 'address_city', 'address_state',
                         'referral_source');

  IF colunas <> 11 THEN
    RAISE EXCEPTION '059 FALHOU: customers com % de 11 colunas novas', colunas;
  END IF;

  IF to_regclass('public.customers_salon_cpf_unique') IS NULL THEN
    RAISE EXCEPTION '059 FALHOU: índice único de CPF não foi criado';
  END IF;

  RAISE NOTICE '059 OK: customers (+11 colunas, CPF único por salão)';
END $$;
