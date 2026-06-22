-- 014_rls_lockdown_drizzle_only.sql  (SEC-2 — P0/P1, defesa em profundidade)
-- Objetivo: travar TODAS as tabelas Drizzle-only. Achado: anon E authenticated têm
-- grants CRUD completos em todas as tabelas; sem RLS a anon key pública pode LER e
-- ESCREVER. Estas tabelas são acessadas só via Drizzle (postgres/service_role,
-- bypassrls), então ENABLE RLS sem policy + REVOKE não quebra o app.
--
-- FORA daqui (de propósito):
--   - as 6 tabelas HÍBRIDAS (profiles, salons, chats, professionals, availability,
--     schedule_overrides) — superfície PostgREST real; tratadas em SEC-5 (decisão do dono);
--   - salon_integrations — já coberta em 013.
--
-- PRÉ-REQUISITO DE SEGURANÇA antes de aplicar: confirmar por grep que NENHUMA destas
-- tabelas é acessada via supabase-js .from() (createClient/createBrowserClient).
-- A auditoria indica que a superfície anon é exatamente as 6 híbridas — reconfirmar.
--
-- Idempotente.

-- 1) Drizzle-only SEM RLS hoje: ENABLE + REVOKE
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'agent_knowledge_base','agent_stats','agents','ai_usage_stats','appointments',
    'campaign_messages','campaign_recipients','campaigns','customer_trinks_profile',
    'customers','embeddings','google_calendar_sync_channels','leads','messages',
    'payments','products','professional_services','recovery_flows','recovery_steps',
    'services','system_prompt_templates','waiting_list'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- só age se a tabela existir (ex.: embeddings pode já ter sido dropada por 018)
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', t);
    END IF;
  END LOOP;
END $$;

-- 2) Tabelas que JÁ têm RLS ligada mas mantêm grants amplos: só REVOKE (menor privilégio)
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'admin_audit_logs','chat_kanban_columns','retention_response_audit','system_alerts'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  RAISE NOTICE '014 OK: RLS + REVOKE nas Drizzle-only (6 híbridas e salon_integrations fora, por design)';
END $$;
