-- 020_agents_whatsapp_cloud_token.sql
-- Coluna para o access token da WhatsApp Cloud API POR SALÃO (onboarding
-- self-service multi-tenant). Guardado CIFRADO (AES-256-GCM via
-- apps/web/lib/infra/crypto.ts) — o valor é um envelope "v1:iv:tag:ct" em
-- base64, NUNCA plaintext.
--
-- Contexto: hoje o envio usa o token único da plataforma (env WHATSAPP_CLOUD_TOKEN),
-- que só alcança números do portfólio do dono (piloto Spettacolo). Para onboardar
-- a WABA de um salão TERCEIRO via Embedded Signup, trocamos o `code` do popup por
-- um access token do cliente e guardamos AQUI (cifrado). whatsapp_cloud_token NULL
-- => o envio cai no fallback do token da env (piloto segue intacto).
--
-- Reverte conscientemente a nota da migration 019 (que adiou o token por-salão
-- "porque não existe cifra em repouso") — agora a cifra existe (lib/infra/crypto.ts).
--
-- ⚠️ HANDOFF data-platform. Aplicar via Supabase apply_migration / CLI —
-- NUNCA db:push/db:generate (guard-migrations.mjs bloqueia; recriaria migrations
-- e dropa constraints). Idempotente, espelha o estilo da 019.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS whatsapp_cloud_token text;

COMMENT ON COLUMN agents.whatsapp_cloud_token IS
  'Access token da WhatsApp Cloud API do salão, CIFRADO (AES-256-GCM, envelope v1:iv:tag:ct em base64). NULL => usa o token da plataforma (env WHATSAPP_CLOUD_TOKEN). Introduzida na migration 020.';
