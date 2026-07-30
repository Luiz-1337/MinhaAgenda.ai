-- 027_appointments_outcome.sql
-- O fato de negócio "atendimento realizado, com valor" + o cancelamento que não
-- apaga a linha. É a peça-raiz do CRM: sem ela, LTV, ticket médio, taxa de
-- retorno, no-show, pós-atendimento e todo relatório são impossíveis — não por
-- falta de query, por falta do dado.
--
-- Situação antes desta migration:
--   - `completed` existe no enum e NENHUM código de produto grava (só os seeds);
--   - `appointments` não tem nenhuma coluna monetária;
--   - cancelar é `db.delete` (packages/db/src/services/appointments.ts), então a
--     linha desaparece e o preditor de no-show conta justamente o que foi apagado.
--
-- Puramente ADITIVA: nenhuma coluna é removida ou alterada, nenhum default muda
-- para linha existente. Rodar esta migration não muda o comportamento do app —
-- quem passa a escrever nestas colunas é o commit de código do Passo 10.
--
-- REQUER a 026 aplicada (usa 'no_show' num índice).
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Colunas do desfecho
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  -- Quando o atendimento foi de fato concluído (o balcão pode fechar depois).
  ADD COLUMN IF NOT EXISTS completed_at   timestamp,
  -- Quando foi marcado como falta. Separado de completed_at porque são desfechos
  -- mutuamente exclusivos e queremos saber QUANDO cada um foi registrado.
  ADD COLUMN IF NOT EXISTS no_show_at     timestamp,
  -- Cancelamento passa a ser soft: a linha fica, com quando/por quê/por quem.
  ADD COLUMN IF NOT EXISTS cancelled_at   timestamp,
  ADD COLUMN IF NOT EXISTS cancel_reason  text,
  -- SET NULL e não CASCADE: apagar o usuário não pode apagar o agendamento.
  -- (admin/users.ts já apaga profiles no fluxo de exclusão de conta.)
  ADD COLUMN IF NOT EXISTS cancelled_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Valor efetivamente cobrado. NÃO é services.price: ~30% dos serviços em
  -- produção são faixa min/max, "sob avaliação" ou 0, e editar o catálogo depois
  -- mudaria o histórico retroativamente.
  -- numeric(10,2): o driver devolve STRING, nunca fazer aritmética direto.
  ADD COLUMN IF NOT EXISTS price_charged  numeric(10,2),
  -- Quem produziu o desfecho: 'panel' | 'cron' | 'ai' | 'google' | 'legacy'.
  -- Permite que relatório separe valor conferido por humano de valor automático.
  ADD COLUMN IF NOT EXISTS outcome_source text;

-- ---------------------------------------------------------------------------
-- 2) Índices
-- ---------------------------------------------------------------------------
-- `appointments` não tinha NENHUM índice em status (só salon+date, client,
-- professional+time, service e os dois de id externo).
CREATE INDEX IF NOT EXISTS appt_salon_status_date_idx
  ON public.appointments (salon_id, status, date);

-- Parcial e pequeno: alimenta o cron de fechamento e o selo "N atendimentos
-- aguardando fechamento" na agenda. Só as linhas em aberto entram no índice.
CREATE INDEX IF NOT EXISTS appt_open_past_idx
  ON public.appointments (end_time)
  WHERE status IN ('pending', 'confirmed');

-- ---------------------------------------------------------------------------
-- 3) Backfill dos 'completed' pré-existentes  — OBRIGATÓRIO antes do CHECK
-- ---------------------------------------------------------------------------
-- Em produção são 45 linhas (de 111), TODAS em salões de seed: Rede Premium Hair
-- (35), Studio A (5) e Salão TOP (5). Nenhum código de produto gravou 'completed'.
--
-- Sem este UPDATE, o CHECK abaixo passaria a reprovar QUALQUER update futuro
-- nessas 45 linhas (inclusive um save() de sync), porque price_charged seria NULL.
--
-- price_charged = 0 e outcome_source = 'legacy': valor honesto (não sabemos quanto
-- foi cobrado, e inventar pelo catálogo poluiria a receita) e rastreável — todo
-- relatório de dinheiro pode excluir `outcome_source = 'legacy'`.
-- completed_at fica NULL de propósito: não temos esse instante, e o eixo de tempo
-- dos relatórios é `date`.
UPDATE public.appointments
   SET price_charged  = 0,
       outcome_source = 'legacy'
 WHERE status = 'completed'
   AND price_charged IS NULL;

-- ---------------------------------------------------------------------------
-- 4) Preço obrigatório para atendimento concluído
-- ---------------------------------------------------------------------------
-- Garantia no banco, não só na Server Action: "concluído" sem valor é
-- precisamente o dado inútil que o CRM não pode aceitar. Cortesia se registra
-- com price_charged = 0 explícito, não com NULL.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_completed_requires_price;
ALTER TABLE public.appointments
  ADD  CONSTRAINT appointments_completed_requires_price
  CHECK (status <> 'completed' OR price_charged IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 5) Fechamento automático é opt-in POR SALÃO
-- ---------------------------------------------------------------------------
-- Default false de propósito. Fechar sozinho um atendimento cujo preço de
-- catálogo é faixa ou "sob avaliação" gravaria receita errada, e relatório errado
-- destrói a confiança mais rápido que relatório ausente. O caminho sempre-ligado
-- é o selo de pendências na agenda; o cron é para quem escolher.
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS auto_close_appointments boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Verificação (schema.ts NÃO é a verdade do banco — conferir aqui)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  faltando int;
  sem_preco int;
BEGIN
  SELECT count(*) INTO faltando
    FROM (VALUES ('completed_at'),('no_show_at'),('cancelled_at'),('cancel_reason'),
                 ('cancelled_by'),('price_charged'),('outcome_source')) AS v(col)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'appointments'
        AND column_name = v.col
   );

  IF faltando > 0 THEN
    RAISE EXCEPTION '027 FALHOU: % coluna(s) de desfecho não foram criadas', faltando;
  END IF;

  SELECT count(*) INTO sem_preco
    FROM public.appointments
   WHERE status = 'completed' AND price_charged IS NULL;

  IF sem_preco > 0 THEN
    RAISE EXCEPTION '027 FALHOU: % linha(s) completed sem price_charged', sem_preco;
  END IF;

  RAISE NOTICE '027 OK: desfecho de atendimento + soft cancel + auto_close (backfill legacy aplicado)';
END $$;
